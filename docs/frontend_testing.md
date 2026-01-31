# Frontend Testing Guide

## Setup

```bash
# Build and start
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d

# Check logs
docker compose -f docker-compose.yml -f docker-compose.local.yml logs react-frontend
```

URL: http://frontend.merakierp.loc

## Login

- Username: `Administrator`
- Password: `MerakiErp2025!`

## Pages Checklist

### Dashboard `/`
- [ ] 4 metric cards load (Customers, Weddings, Employees, Revenue)
- [ ] Expected: ~132 customers, 134 weddings, 10 active employees, ~11B VND
- [ ] Monthly Revenue bar chart renders with data
- [ ] Weddings by Month bar chart renders with data

### CRM
- [ ] `/crm/customers` - 132 customers, columns: Name, Group, Phone, Email
- [ ] `/crm/customers/:name` - Customer info + linked Sales Orders table
- [ ] `/crm/weddings` - 134 orders, columns: Order, Customer, Date, Amount, Status
- [ ] `/crm/weddings/:name` - Wedding details + items table with qty/rate/amount
- [ ] `/crm/leads` - Lead list with status filter dropdown (may be empty if no leads exist)
- [ ] `/crm/leads/:name` - Lead detail + "Convert to Opportunity" button
- [ ] `/crm/opportunities` - Opportunity list with status filter dropdown
- [ ] `/crm/opportunities/:name` - Opportunity detail + source Lead link (if from Lead)

### HR
- [ ] `/hr/employees` - 16 employees, columns: Name, Designation, Department, Status
- [ ] `/hr/employees/:name` - Personal info + employment details + Meraki ID
- [ ] `/hr/leaves` - Applications tab with approve/reject buttons, Balances tab with allocations
- [ ] `/hr/onboarding` - Onboarding list with status badges (Pending/In Process/Completed)
- [ ] `/hr/onboarding/:name` - Employee info + activities checklist with completion indicators

### Finance
- [ ] `/finance/invoices` - 135 invoices, columns: Invoice, Customer, Date, Amount, Outstanding, Status
- [ ] `/finance/invoices/:name` - Invoice details + items + linked Sales Order
- [ ] `/finance/journals` - 19 journal entries with debit/credit amounts
- [ ] `/finance/overview` - Total revenue/expenses/net + Revenue vs Expenses bar chart + monthly breakdown table

### Navigation
- [ ] Sidebar shows CRM, HR, Finance sections
- [ ] CRM section has: Customers, Weddings, Leads, Opportunities
- [ ] HR section has: Employees, Leave Management, Onboarding
- [ ] All links navigate correctly
- [ ] Logout button works
- [ ] Browser back/forward works (SPA routing)

## Permission Testing

To test role-based access control:

### Create Test Users in ERPNext

1. Go to ERPNext > User List > Add User
2. Create users with specific roles:
   - `sales@test.com` — Role: Sales User (should see CRM only)
   - `hr@test.com` — Role: HR User (should see HR only)
   - `accounts@test.com` — Role: Accounts User (should see Finance only)

### Verify Sidebar Visibility

| User | Should See | Should NOT See |
|------|-----------|----------------|
| Administrator | All modules | — |
| Sales User | CRM (Customers, Weddings, Leads, Opportunities) | HR, Finance |
| HR User | HR (Employees, Leave Management, Onboarding) | CRM, Finance |
| Accounts User | Finance (Invoices, Journals, Overview) | CRM, HR |

### Verify Route Access

1. Log in as restricted user (e.g., `sales@test.com`)
2. Try navigating directly to restricted routes (e.g., `/hr/employees`)
3. Should redirect to Dashboard (`/`)
4. Verify sidebar only shows permitted modules

### Test Scenarios

**CRM - Leads Pipeline:**
1. Navigate to `/crm/leads`
2. Use status filter to filter leads
3. Click a lead to view detail
4. Click "Convert to Opportunity" — confirm dialog appears
5. After conversion, redirects to new Opportunity detail page

**HR - Leave Management:**
1. Navigate to `/hr/leaves`
2. Switch between Applications and Balances tabs
3. On Applications tab, filter by status
4. For Open applications (docstatus=0), Approve/Reject buttons should appear
5. Click Approve — status changes, buttons disappear

**HR - Onboarding:**
1. Navigate to `/hr/onboarding`
2. Click an onboarding record
3. Verify activities list shows with completion indicators (checkmarks vs empty circles)

**Charts:**
1. Dashboard — verify both bar charts render with monthly data
2. Finance Overview — verify grouped bar chart shows revenue (green) and expenses (red)

## Rebuild After Changes

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
```
