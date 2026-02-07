# ERPNext Setup - Meraki Wedding Planner

This document describes the ERPNext configuration for Meraki Wedding Planner (MWP).

**Versions:** Frappe 15.96.0, ERPNext 15.94.3, HRMS 15.55.0

## Company

- **Name:** Meraki Wedding Planner
- **Abbreviation:** MWP
- **Default Currency:** VND (Vietnamese Dong)
- **Country:** Vietnam
- **Territory:** Vietnam

## Service Company Configuration

Meraki is a service-based business with no physical inventory. The key configuration difference from a product company:

- **skip_delivery_note** is enabled globally via Property Setter (default value = 1, visible but not hidden)
- No stock management, warehousing, or inventory tracking
- Sales Orders go directly from Submitted to Billed without requiring Delivery Notes
- All 134 legacy Delivery Notes were cancelled during migration

## Chart of Accounts

Uses the Standard Template chart of accounts with the following key accounts:

**Revenue and Receivables**
- Sales - MWP (income/revenue)
- Debtors - MWP (accounts receivable)

**Cash**
- Cash - MWP (bank/cash)

**Expense Accounts**
- Expenses - MWP (parent)
  - Salary - MWP
  - Office Expenses - MWP
  - Marketing Expenses - MWP
  - Travel Expenses - MWP
  - Software Expenses - MWP
  - Miscellaneous Expenses - MWP

Cost categories from the source database map to these expense accounts: Office, Marketing, Travel, and Software map to their respective accounts; all others default to Miscellaneous Expenses.

## Items

Three service items under the "Wedding Services" item group:

| Item Code | Item Name | Description |
|-----------|-----------|-------------|
| SVC-FULL | Full Package | Complete wedding planning service |
| SVC-PARTIAL | Partial Package | Partial wedding planning service |
| SVC-COORDINATOR | Coordinator | Day-of wedding coordination |

An additional "Add-on Services" item group exists as a child of Wedding Services for future use.

## Sales Order Lifecycle

For a wedding, the Sales Order follows this path:

**Draft** - Sales Order created with customer, wedding date, service item, and total value.

**Submitted (To Deliver and Bill)** - Order confirmed. Since skip_delivery_note is enabled, per_delivered is automatically set to 100%.

**Billed** - Sales Invoice created against the Sales Order. Once fully invoiced, per_billed reaches 100%.

**Completed** - Both per_delivered and per_billed are at 100%. Status changes automatically.

Important: Never use "Closed" status. It is a manual override that excludes orders from standard reports and does not represent proper completion.

## Financial Documents

**Sales Invoices** - One per wedding, dated on the wedding date, for 100% of the wedding value. Links to the corresponding Sales Order.

**Payment Entries** - Record actual payments received. Wedding payment structure is 50% deposit on booking, 30% second payment before the wedding, and 20% final payment after the wedding.

**Journal Entries** - Used for salary expenses. Monthly entries that debit Salary - MWP and credit Cash - MWP, calculated as the sum of all active employees' monthly salaries for that period.

## Migrated Data Summary

| Entity | Count | Notes |
|--------|-------|-------|
| Employees | 16 | Each has custom_meraki_id field |
| Customers | 131 | Unique clients, deduplicated |
| Suppliers/Venues | 35 | Each has custom_meraki_venue_id field |
| Sales Orders | 134 | All Completed status, submitted |
| Projects | 134 | Bidirectionally linked to Sales Orders |
| Journal Entries | 18 | All submitted (costs and salaries) |
| Fiscal Years | 5 | 2022, 2023, 2024, 2025, 2026 |

Migration QA verification achieved a 96% success rate. One known minor issue: SAL-ORD-2026-00017 has a zero grand total, which reflects a legitimate partial payment case from the source data.

## Disabled Modules

These modules are disabled via hidden Workspaces (`public=0`, `is_hidden=1`) and blocked per-user (`tabBlock Module`):

| Module | Reason |
|--------|--------|
| Buying | Not needed — Meraki is a service business with no procurement |
| Website | Not needed — not using ERPNext website builder |
| Manufacturing | Not applicable to wedding planning |
| Quality Management | No quality inspection workflows needed |
| Projects | Workspace hidden — Project doctypes still used for wedding tracking |
| Support | No customer support ticketing needed |
| Stock | Workspace hidden and replaced with Services — Item doctype still used for service items |

Hiding the Workspace prevents direct URL access (e.g. `/app/manufacturing`). Blocking per-user removes the module from the sidebar.

## Services Workspace

A custom **Services** workspace replaces the Stock workspace, providing a clean service-oriented view without inventory clutter.

**Shortcuts:** Item, Sales Order, Sales Invoice, Customer

**Cards:**

| Card | Links |
|------|-------|
| Service Catalogue | Item, Item Group |
| Selling | Sales Order, Sales Invoice, Payment Entry |
| CRM | Customer, Quotation |

The workspace is assigned to the Stock module so that Item and related doctypes remain accessible. Access it at `/app/services`.

## Key Settings

**Global Defaults**
- Default Currency: VND
- Default Price List: Standard Selling VND

**Property Setters**
- Sales Order skip_delivery_note default value set to 1
- Sales Order skip_delivery_note hidden set to 0 (visible for reference)

**Units of Measure:** Unit, Package, Service, Hour, Day

**Fiscal Years:** 2022 through 2026

## ERPNext APIs

All endpoints use the base URL http://merakierp.loc and require authentication via API key/secret headers or session cookie.

### Resource APIs (CRUD)

Each doctype referenced in this document has a corresponding REST resource API at /api/resource/{DocType}.

| DocType | Endpoint | Used For |
|---------|----------|----------|
| Company | /api/resource/Company | Company settings and configuration |
| Employee | /api/resource/Employee | Staff records with custom_meraki_id |
| Customer | /api/resource/Customer | Wedding clients |
| Supplier | /api/resource/Supplier | Venues with custom_meraki_venue_id |
| Item | /api/resource/Item | Service items (SVC-FULL, SVC-PARTIAL, SVC-COORDINATOR) |
| Sales Order | /api/resource/Sales Order | Wedding bookings and lifecycle tracking |
| Sales Invoice | /api/resource/Sales Invoice | Revenue recognition per wedding |
| Payment Entry | /api/resource/Payment Entry | Deposit and payment records |
| Journal Entry | /api/resource/Journal Entry | Salary expense entries |
| Project | /api/resource/Project | Wedding projects linked to Sales Orders |
| Delivery Note | /api/resource/Delivery Note | Cancelled legacy records (not used for new orders) |
| Fiscal Year | /api/resource/Fiscal Year | Financial year periods (2022-2026) |
| Property Setter | /api/resource/Property Setter | Field defaults like skip_delivery_note |
| Account | /api/resource/Account | Chart of accounts entries |
| Item Group | /api/resource/Item Group | Wedding Services and Add-on Services groups |
| Lead | /api/resource/Lead | CRM leads with wedding custom fields |
| Lead Source | /api/resource/Lead Source | Lead acquisition channels (Google, Facebook, Instagram, Referral, Other) |
| Custom Field | /api/resource/Custom Field | Custom field definitions on doctypes |

### Standard Operations

For any doctype above, the following operations apply:

- **List** - GET /api/resource/{DocType}?filters=[]&fields=[]&limit_page_length=0
- **Get** - GET /api/resource/{DocType}/{name}
- **Create** - POST /api/resource/{DocType} with JSON body
- **Update** - PUT /api/resource/{DocType}/{name} with JSON body
- **Delete** - DELETE /api/resource/{DocType}/{name}

### Document Workflow APIs

These method endpoints handle document state transitions used in the Sales Order lifecycle and financial documents.

| Endpoint | Purpose |
|----------|---------|
| /api/method/frappe.client.submit | Submit a draft document (Draft to Submitted) |
| /api/method/frappe.client.cancel | Cancel a submitted document |
| /api/method/frappe.client.amend | Amend a cancelled document |
| /api/method/frappe.client.get_count | Count documents matching filters |
| /api/method/frappe.client.get_list | Alternative list endpoint with more options |

### Authentication

API requests authenticate via token header using the API key and secret from the Access section below.

Header format: Authorization: token {api_key}:{api_secret}

### Quick Example

List all Completed Sales Orders with customer name and grand total:

    GET /api/resource/Sales Order?filters=[["status","=","Completed"]]&fields=["name","customer_name","grand_total"]&limit_page_length=0

    Headers:
      Authorization: token 2c17d14ed504109:eaa8dc0027a2236

Get a single Sales Order by name:

    GET /api/resource/Sales Order/SAL-ORD-2026-00001

Create a new Customer:

    POST /api/resource/Customer
    Content-Type: application/json

    {"customer_name": "John Doe", "customer_type": "Individual", "customer_group": "Individual", "territory": "Vietnam"}

Submit a draft Sales Invoice (changes docstatus from 0 to 1):

    POST /api/method/frappe.client.submit
    Content-Type: application/json

    {"doc": {"doctype": "Sales Invoice", "name": "ACC-SINV-2026-00001"}}

## Holiday List

- **Name:** Vietnam 2026
- **Period:** 2026-01-01 to 2026-12-31
- **Total Holidays:** 62 (11 public holidays + 51 Sundays)
- **Weekly Off:** Sunday
- **Set as company default** for Meraki Wedding Planner

Public holidays: New Year (Jan 1), Tet/Lunar New Year (Feb 17-21), Hung Kings Commemoration (Apr 12), Reunification Day (Apr 30), International Labour Day (May 1), National Day (Sep 2-3).

## Leave Management

**Leave Period:** 2026-01-01 to 2026-12-31 (HR-LPR-2026-00001)

**Leave Allocation:** HR-EMP-00001 (Xu) has 12 days Casual Leave for 2026 (submitted).

**Leave Approver:** Administrator (has Leave Approver role)

### Leave Approver Configuration

Each employee must have a `leave_approver` set on their Employee record for leave approval workflow to function. The leave_approver is notified when the employee submits a leave request and is the only user who can approve/reject it.

**Current Status:**
| Employee | Leave Approver |
|----------|----------------|
| HR-EMP-00001 (Xu) | Administrator |
| All others | **Not configured** |

**TODO:** Set leave_approver for all employees. Options:
1. Set Administrator as approver for all employees
2. Set department heads as approvers for their team members
3. Create a dedicated HR user to approve all leaves

To configure: Employee > [Employee Name] > Attendance and Leave Details > Leave Approver

### Attendance Request (WFH)

WFH requests use the Attendance Request doctype with `reason = "Work From Home"`. These are approved by users with the **HR Manager** role (currently Administrator).

## Email Configuration

**Outgoing Email Account:** Meraki Notifications
- Email: noreply@merakiweddingplanner.com
- SMTP Server: smtp.sendgrid.net, Port 587, STARTTLS
- Login: `apikey` (literal string, SendGrid requirement)
- Default outgoing, always use account email as sender
- Used for all ERPNext system emails and notifications

**SendGrid Configuration:**
- Authentication uses API key with "Mail Send" permission
- Sender identity verified via domain authentication
- Activity tracking available at https://app.sendgrid.com/email_activity

**Test Employee Email:** xu-test@mobelaris.info (mapped to HR-EMP-00001)

## Users

| User | Roles | Linked To |
|------|-------|-----------|
| Administrator | System Manager, Leave Approver | — |
| xu-test@mobelaris.info | Employee, Employee Self Service | HR-EMP-00001 (Xu) |

## Notifications

### Leave Application Submitted for Approval

- **Document Type:** Leave Application
- **Event:** New
- **Channel:** Email
- **Recipient:** `leave_approver` field on the document
- **Template:** HTML email with leave details (employee name, type, dates, days, reason)

### Leave Rejection Email

- **Document Type:** Leave Application
- **Event:** Submit
- **Condition:** `doc.status == "Rejected"`
- **Channel:** Email + System Notification
- **Recipient:** Employee (via custom `employee_email` field that fetches from `employee.user_id`)
- **Template:** HTML email with leave details table (type, dates, days, reason, approver)

### WFH Request Submitted

- **Document Type:** Attendance Request
- **Event:** New
- **Condition:** `doc.reason == "Work From Home"`
- **Channel:** Email
- **Recipient:** Users with HR Manager role
- **Template:** HTML email with WFH details (employee name, dates, notes)

### Leave Submission Telegram

- **Type:** Server Script (DocType Event)
- **Document Type:** Leave Application
- **Event:** After Submit
- **Destination:** Telegram Bot (merakiwpbot) → Chat ID 6570637027
- **Message:** Status emoji + employee name, leave type, dates, days, reason

### Custom Fields

| DocType | Field | Type | Fetch From | Purpose |
|---------|-------|------|------------|---------|
| Leave Application | employee_email | Data | employee.user_id | Notification recipient resolution |
| Lead | custom_relationship | Select | — | Relationship to couple (Bride/Groom, Mother, Friend, Other) |
| Lead | custom_couple_name | Data | — | Names of the wedding couple |
| Lead | custom_wedding_date | Date | — | Planned wedding date |
| Lead | custom_wedding_venue | Data | — | Wedding venue or city |
| Lead | custom_guest_count | Int | — | Expected number of guests |
| Lead | custom_estimated_budget | Currency | — | Estimated wedding budget (VND) |

## Access

| Resource | Details |
|----------|---------|
| ERPNext URL | http://merakierp.loc |
| Admin Login | Administrator / MerakiErp2025! |
| API Key | 2c17d14ed504109 |
| API Secret | eaa8dc0027a2236 |
| ERPNext Version | Frappe 15.96.0, ERPNext 15.94.3, HRMS 15.55.0 |
| Database | MariaDB via Docker containers |
| Source Database | PostgreSQL at 14.225.210.164:5432 (meraki_nocodb) |
