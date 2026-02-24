"""
Backfill venue and lead planner data on migrated weddings.

Steps:
1. Seed custom_meraki_venue_id on Suppliers by matching venue title to supplier_name.
2. Build venue_map (source venue_id → Supplier.name) and employee_map (meraki_id → Employee.name).
3. For each source wedding, update the matching Sales Order's custom_venue and the
   matching Project's custom_lead_planner / custom_support_planner / custom_assistant_1/2.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.config import get_config
from core.pg_client import MerakiPGClient


def run(client):
    config = get_config()
    pg = MerakiPGClient(config['postgres'])
    try:
        _run(client, pg)
    finally:
        pg.close()


def _run(client, pg):
    # Step 0: allow custom_venue to be edited on submitted Sales Orders
    cf = client.find_one('Custom Field', {'dt': 'Sales Order', 'fieldname': 'custom_venue'})
    if cf and not cf.get('allow_on_submit'):
        client.update('Custom Field', 'Sales Order-custom_venue', {'allow_on_submit': 1})
        print("  Enabled allow_on_submit on Sales Order.custom_venue")

    # Step 1: seed custom_meraki_venue_id on Suppliers
    venues = pg.get_all_venues()
    print(f"  Found {len(venues)} source venues")

    venue_id_seeded = 0
    for venue in venues:
        title = (venue.get('title') or '').strip()
        if not title:
            continue
        supplier = client.find_one('Supplier', {'supplier_name': title})
        if not supplier:
            continue
        supplier_name = supplier['name']
        # Only update if not already set
        full = client.get('Supplier', supplier_name)
        if full and full.get('custom_meraki_venue_id'):
            continue
        result = client.update('Supplier', supplier_name, {'custom_meraki_venue_id': venue['id']})
        if result:
            venue_id_seeded += 1

    print(f"  Seeded custom_meraki_venue_id on {venue_id_seeded} suppliers")

    # Step 2: build lookup maps
    suppliers = client.get_list(
        'Supplier',
        filters=[['custom_meraki_venue_id', 'is', 'set']],
        fields=['name', 'custom_meraki_venue_id'],
        limit=0,
    )
    venue_map = {int(s['custom_meraki_venue_id']): s['name'] for s in suppliers if s.get('custom_meraki_venue_id')}
    print(f"  venue_map: {len(venue_map)} entries")

    employees = client.get_list(
        'Employee',
        filters=[['custom_meraki_id', 'is', 'set']],
        fields=['name', 'custom_meraki_id'],
        limit=0,
    )
    employee_map = {int(e['custom_meraki_id']): e['name'] for e in employees if e.get('custom_meraki_id')}
    print(f"  employee_map: {len(employee_map)} entries")

    # Step 3: build ERPNext ID maps for Sales Orders and Projects
    so_records = client.get_list(
        'Sales Order',
        filters=[['custom_meraki_wedding_id', 'is', 'set']],
        fields=['name', 'custom_meraki_wedding_id'],
        limit=0,
    )
    so_map = {int(r['custom_meraki_wedding_id']): r['name'] for r in so_records if r.get('custom_meraki_wedding_id')}
    print(f"  Sales Orders with meraki ID: {len(so_map)}")

    project_records = client.get_list(
        'Project',
        filters=[['custom_meraki_wedding_id', 'is', 'set']],
        fields=['name', 'custom_meraki_wedding_id'],
        limit=0,
    )
    project_map = {int(r['custom_meraki_wedding_id']): r['name'] for r in project_records if r.get('custom_meraki_wedding_id')}
    print(f"  Projects with meraki ID: {len(project_map)}")

    # Step 4: fetch source weddings and apply updates
    weddings = pg.get_all_weddings()
    print(f"  Processing {len(weddings)} source weddings")

    so_updated = 0
    so_skipped = 0
    project_updated = 0
    project_skipped = 0

    for wedding in weddings:
        wedding_id = int(wedding['id'])

        # Update Sales Order custom_venue
        venue_id = wedding.get('venue_id')
        so_name = so_map.get(wedding_id)
        if so_name and venue_id and int(venue_id) in venue_map:
            result = client.update('Sales Order', so_name, {'custom_venue': venue_map[int(venue_id)]})
            if result:
                so_updated += 1
            else:
                print(f"    Warning: failed to update SO {so_name} venue")
        else:
            so_skipped += 1

        # Update Project staff fields
        proj_name = project_map.get(wedding_id)
        if not proj_name:
            project_skipped += 1
            continue

        staff_data = {}
        for field, source_key in [
            ('custom_lead_planner', 'lead_planner_id'),
            ('custom_support_planner', 'support_planner_id'),
            ('custom_assistant_1', 'assistant1_id'),
            ('custom_assistant_2', 'assistant2_id'),
        ]:
            staff_id = wedding.get(source_key)
            if staff_id and int(staff_id) in employee_map:
                staff_data[field] = employee_map[int(staff_id)]

        if staff_data:
            result = client.update('Project', proj_name, staff_data)
            if result:
                project_updated += 1
            else:
                print(f"    Warning: failed to update Project {proj_name} staff")
        else:
            project_skipped += 1

    print(f"  Sales Orders: {so_updated} updated, {so_skipped} skipped")
    print(f"  Projects: {project_updated} updated, {project_skipped} skipped")
