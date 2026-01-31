"""
PostgreSQL client for Meraki NocoDB database.

Provides read-only access to source data for migration.
"""

import psycopg2
from psycopg2.extras import RealDictCursor
from typing import List, Optional


class MerakiPGClient:
    """Client for reading data from Meraki NocoDB PostgreSQL database."""

    def __init__(self, config: dict):
        """Initialize the PostgreSQL client.

        Args:
            config: Dictionary with host, port, user, password, database keys.
        """
        self.conn = psycopg2.connect(
            host=config['host'],
            port=config['port'],
            user=config['user'],
            password=config['password'],
            database=config['database'],
        )

    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()

    def _execute(self, query: str, params: tuple = None) -> List[dict]:
        """Execute a query and return results as list of dicts."""
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()

    def _execute_one(self, query: str, params: tuple = None) -> Optional[dict]:
        """Execute a query and return single result."""
        results = self._execute(query, params)
        return results[0] if results else None

    # Staff queries

    def get_all_staff(self) -> List[dict]:
        """Get all staff records."""
        return self._execute('''
            SELECT id, name, title, email, "Status", join_date,
                   salary, lead_commission, support_commission,
                   sales_commission, assistant_commission, bonus
            FROM staff
            ORDER BY id
        ''')

    def get_active_staff(self) -> List[dict]:
        """Get active staff records."""
        return self._execute('''
            SELECT id, name, title, email, "Status", join_date,
                   salary, lead_commission, support_commission,
                   sales_commission, assistant_commission, bonus
            FROM staff
            WHERE "Status" = 'Active'
            ORDER BY id
        ''')

    def get_staff_with_salary(self) -> List[dict]:
        """Get staff records with salary information."""
        return self._execute('''
            SELECT id, name, title, email, "Status", join_date, salary
            FROM staff
            WHERE salary IS NOT NULL AND salary > 0
            ORDER BY id
        ''')

    def count_staff(self) -> int:
        """Count total staff."""
        result = self._execute_one('SELECT COUNT(*) as count FROM staff')
        return result['count'] if result else 0

    # Venue queries

    def get_all_venues(self) -> List[dict]:
        """Get all venue records."""
        return self._execute('''
            SELECT id, title, city, address, contact_person, email, phone, notes
            FROM venue
            ORDER BY city, title
        ''')

    def count_venues(self) -> int:
        """Count total venues."""
        result = self._execute_one('SELECT COUNT(*) as count FROM venue')
        return result['count'] if result else 0

    # Wedding queries

    def get_all_weddings(self) -> List[dict]:
        """Get all weddings with related data."""
        return self._execute('''
            SELECT w.id, w.client, w.date, w.service, w.type, w.amount,
                   w.venue_id, w.lead_planner_id, w.support_planner_id,
                   w.assistant1_id, w.assistant2_id,
                   v.title as venue_name, v.city as venue_city,
                   s1.name as lead_planner_name, s1.email as lead_planner_email,
                   s2.name as support_planner_name,
                   s3.name as assistant1_name,
                   s4.name as assistant2_name
            FROM weddings w
            LEFT JOIN venue v ON w.venue_id = v.id
            LEFT JOIN staff s1 ON w.lead_planner_id = s1.id
            LEFT JOIN staff s2 ON w.support_planner_id = s2.id
            LEFT JOIN staff s3 ON w.assistant1_id = s3.id
            LEFT JOIN staff s4 ON w.assistant2_id = s4.id
            ORDER BY w.date
        ''')

    def get_unique_clients(self) -> List[dict]:
        """Get unique client names from weddings."""
        return self._execute('''
            SELECT DISTINCT client
            FROM weddings
            WHERE client IS NOT NULL AND client != ''
            ORDER BY client
        ''')

    def count_weddings(self) -> int:
        """Count total weddings."""
        result = self._execute_one('SELECT COUNT(*) as count FROM weddings')
        return result['count'] if result else 0

    def count_unique_clients(self) -> int:
        """Count unique clients."""
        result = self._execute_one('''
            SELECT COUNT(DISTINCT client) as count
            FROM weddings
            WHERE client IS NOT NULL AND client != ''
        ''')
        return result['count'] if result else 0

    # Wedding addon queries

    def get_all_addons(self) -> List[dict]:
        """Get all wedding addons."""
        return self._execute('''
            SELECT id, title, price
            FROM wedding_addon
            ORDER BY title
        ''')

    def get_wedding_addons(self, wedding_id: int) -> List[dict]:
        """Get addons for a specific wedding."""
        return self._execute('''
            SELECT wa.id, wa.title, wa.price
            FROM wedding_addon wa
            JOIN _nc_m2m_wedding_wedding_addon m2m ON wa.id = m2m.wedding_addon_id
            WHERE m2m.weddings_id = %s
        ''', (wedding_id,))

    def count_addons(self) -> int:
        """Count total addons."""
        result = self._execute_one('SELECT COUNT(*) as count FROM wedding_addon')
        return result['count'] if result else 0

    # Task queries

    def get_all_tasks(self) -> List[dict]:
        """Get all tasks."""
        return self._execute('''
            SELECT t.id, t.title, t.content, t.wedding_id, t.staff_id,
                   w.client as wedding_client,
                   s.name as staff_name
            FROM task t
            LEFT JOIN weddings w ON t.wedding_id = w.id
            LEFT JOIN staff s ON t.staff_id = s.id
            ORDER BY t.id
        ''')

    def count_tasks(self) -> int:
        """Count total tasks."""
        result = self._execute_one('SELECT COUNT(*) as count FROM task')
        return result['count'] if result else 0

    # Cost queries

    def get_all_costs(self) -> List[dict]:
        """Get all cost records."""
        return self._execute('''
            SELECT id, title, amount, date, categories
            FROM cost
            ORDER BY date DESC
        ''')

    def count_costs(self) -> int:
        """Count total costs."""
        result = self._execute_one('SELECT COUNT(*) as count FROM cost')
        return result['count'] if result else 0

    # Payroll queries

    def get_all_payroll(self) -> List[dict]:
        """Get all payroll records with staff info."""
        return self._execute('''
            SELECT p.id, p.title, p.date, p.staff_id,
                   p.amount, p.salary, p.bonus,
                   p.lead_commission, p.support_commission, p.assistant_commission,
                   s.name as staff_name, s.email as staff_email
            FROM payroll p
            LEFT JOIN staff s ON p.staff_id = s.id
            ORDER BY p.date DESC, s.name
        ''')

    def count_payroll(self) -> int:
        """Count total payroll records."""
        result = self._execute_one('SELECT COUNT(*) as count FROM payroll')
        return result['count'] if result else 0

    # Summary

    def get_summary(self) -> dict:
        """Get count summary of all tables."""
        return {
            'staff': self.count_staff(),
            'venues': self.count_venues(),
            'weddings': self.count_weddings(),
            'unique_clients': self.count_unique_clients(),
            'addons': self.count_addons(),
            'tasks': self.count_tasks(),
            'costs': self.count_costs(),
            'payroll': self.count_payroll(),
        }
