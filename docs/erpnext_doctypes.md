# ERPNext Doctype Reference for Frontend

Reference of every ERPNext doctype the React frontend (`refinefrontend/`) uses, grouped by domain. 20 doctypes + 4 child tables across CRM, HR, Finance, and System.

TypeScript interfaces live in `refinefrontend/src/lib/types.ts`.

---

## CRM Doctypes

### Lead

First contact / inquiry from a potential client. Appears on the Kanban board in the **New** and **Engaged** columns. When a lead is dragged to **Qualified** or **Quoted**, it auto-converts to an Opportunity.

**Standard fields:** `name`, `lead_name`, `first_name`, `last_name`, `email_id`, `phone`, `mobile_no`, `source`, `status`, `company_name`, `city`, `country`, `creation`, `notes`

**Custom fields:** `custom_couple_name`, `custom_wedding_date`, `custom_wedding_venue`, `custom_guest_count`, `custom_estimated_budget`, `custom_relationship`

**Statuses used:**
| Kanban Column | Lead Status |
|---------------|-------------|
| New | Lead, Open |
| Engaged | Replied, Interested |
| Lost | Do Not Contact, Lost Quotation |
| (hidden) | Converted, Opportunity, Quotation |

**Frontend operations:** List, Get, Update (status + source field), Delete

**Key components:** `KanbanPage`, `LeadDetailPage`, `DashboardPage`

---

### Opportunity

Qualified lead being actively pursued. Appears on the Kanban board in **Qualified**, **Quoted**, **Won**, and **Lost** columns. Created automatically when a Lead is dragged to Qualified/Quoted, or manually via the "Convert to Opportunity" button on LeadDetailPage.

**Fields:** `name`, `party_name`, `customer_name`, `opportunity_from`, `opportunity_type`, `status`, `expected_closing`, `opportunity_amount`, `source`, `creation`, `contact_email`, `contact_mobile`

**Statuses used:**
| Kanban Column | Opportunity Status |
|---------------|-------------------|
| Qualified | Open, Replied |
| Quoted | Quotation |
| Won | Converted |
| Lost | Lost, Closed |

**Links:** `party_name` references the Lead name when `opportunity_from == "Lead"`. The OpportunityDetailPage fetches the linked Lead to display wedding details.

**Frontend operations:** List, Get, Create (from Lead conversion), Update (status + editable fields), Delete

**Key components:** `KanbanPage`, `OpportunityDetailPage`, `LeadDetailPage` (conversion)

---

### Communication

Email/message records linked to Leads or Opportunities. Drives the activity feed and kanban "last activity" indicators.

**Fields:** `name`, `reference_doctype`, `reference_name`, `sent_or_received`, `communication_date`, `subject`, `content`, `communication_medium`, `sender`, `recipients`, `communication_type`, `send_email`

**Key distinctions:**
- `communication_type: "Communication"` = real client email; `"Notification"` = internal staff notification
- `sent_or_received: "Sent"` = staff sent it (kanban shows "Awaiting client"); `"Received"` = client replied (kanban shows "Awaiting staff")

**Frontend operations:** List (filtered by `reference_doctype`/`reference_name`), Create (staff notifications via send_email)

**Key components:** `ActivitySection`, `KanbanPage` (activity enrichment via `kanban.ts`)

---

### Comment

Internal notes on documents. Always filtered by `comment_type = "Comment"` to exclude system-generated comments.

**Fields:** `name`, `content`, `comment_email`, `creation`, `reference_doctype`, `reference_name`, `comment_type`

**Frontend operations:** List (filtered by `reference_doctype`/`reference_name`), Create

**Key components:** `ActivitySection`

---

### Lead Source

Lookup table for where leads come from (e.g., Instagram, Referral, Wedding fair).

**Fields:** `name` (the source name itself, used as both ID and label)

**Frontend operations:** List (populates dropdown on LeadDetailPage)

---

## HR Doctypes

### Employee

Staff member record. Two TypeScript interfaces exist: `Employee` (list/basic view) and `EmployeeProfile` (self-service profile with extended fields).

**Basic fields:** `name`, `employee_name`, `first_name`, `middle_name`, `last_name`, `designation`, `department`, `status`, `date_of_joining`, `date_of_birth`, `cell_phone`, `company_email`, `personal_email`, `ctc`

**Self-service profile fields:** `gender`, `current_address`, `permanent_address`, `person_to_be_contacted`, `relation`, `emergency_phone_number`, `bank_name`, `bank_ac_no`, `iban`

**Custom:** `custom_meraki_id`

**Frontend operations:** List, Get, Update (self-service profile only)

**Key components:** `EmployeesPage`, `EmployeeDetailPage`, `MyProfilePage`, `LeavesPage`, `PayrollPage`, `DashboardPage`, `ActivitySection` (staff notification selector), `useMyEmployee` hook

---

### Leave Application

Employee leave request. Uses ERPNext's submission workflow (`docstatus`).

**Fields:** `name`, `employee`, `employee_name`, `leave_type`, `from_date`, `to_date`, `total_leave_days`, `status`, `docstatus`

**Status values:** Open, Approved, Rejected

**Frontend operations:** List, Update (approve/reject via `frappe.client.submit`)

**Key components:** `LeavesPage`

---

### Leave Allocation

Annual leave budget per employee per leave type. Used to calculate remaining balance (allocated minus taken).

**Fields:** `name`, `employee`, `employee_name`, `leave_type`, `new_leaves_allocated`, `total_leaves_allocated`, `from_date`, `to_date`, `docstatus`

**Frontend operations:** List (submitted only, `docstatus: 1`), Update (`total_leaves_allocated` via `frappe.client.set_value`)

**Key components:** `LeavesPage`

---

### Employee Onboarding

New hire onboarding tracker with checklist activities.

**Fields:** `name`, `employee`, `employee_name`, `boarding_status`, `department`, `designation`, `date_of_joining`

**Child table `activities`:** `activity_name`, `user`, `role`, `required_for_employee_creation`, `description`, `completed`

**Frontend operations:** List, Get (read-only)

**Key components:** `OnboardingPage`, `OnboardingDetailPage`

---

### Payroll Entry

Monthly payroll generation. Used to create salary slips for all active employees.

**Fields:** `name`, `posting_date`, `start_date`, `end_date`, `docstatus`, `status`, `number_of_employees`, `payroll_frequency`, `company`, `currency`, `exchange_rate`, `cost_center`, `payment_account`, `payroll_payable_account`

**Frontend operations:** List, Create (via `useCustomMutation`), Process (`fill_employee_details`, `create_salary_slips`, `submit_salary_slips` via `run_doc_method`)

**Key components:** `PayrollPage`

---

### Salary Slip

Individual employee salary record for a payroll period. Defined inline in `PayrollPage.tsx` (no shared type).

**Fields:** `name`, `employee`, `employee_name`, `gross_pay`, `net_pay`, `posting_date`, `docstatus`, `payroll_entry`

**Frontend operations:** List (filtered by `payroll_entry`)

**Key components:** `PayrollPage`

---

## Finance Doctypes

### Sales Invoice

Invoice to customer for wedding services.

**Fields:** `name`, `customer`, `customer_name`, `posting_date`, `grand_total`, `outstanding_amount`, `status`, `sales_order`

**Status values:** Paid, Unpaid, Overdue, Cancelled, Return

**Frontend operations:** List, Get (read-only)

**Key components:** `InvoicesPage`, `InvoiceDetailPage`, `OverviewPage`, `PaymentSummary`

---

### Sales Order

Booked wedding — the core business document. Only used in the frontend for wedding date conflict detection on LeadDetailPage.

**Fields:** `name`, `customer`, `customer_name`, `transaction_date`, `delivery_date` (= wedding date), `grand_total`, `status`, `per_delivered`, `per_billed`, `project`, `custom_wedding_date`, `custom_venue`, `docstatus`

**Child table `items`:** `item_code`, `item_name`, `qty`, `rate`, `amount`

**Frontend operations:** List (conflict check only, filtered by `delivery_date`)

**Key components:** `LeadDetailPage` (wedding date conflict warnings)

---

### Payment Entry

Payment received from customer or made to supplier.

**Fields:** `name`, `payment_type`, `party_type`, `party`, `party_name`, `posting_date`, `paid_amount`, `mode_of_payment`, `reference_no`, `docstatus`

**Child table `references`:** `reference_doctype`, `reference_name`, `allocated_amount`

**Frontend operations:** List, Get (read-only)

**Key components:** `PaymentsPage`, `PaymentDetailPage`, `PaymentSummary`

---

### Purchase Invoice

Expense / vendor invoice.

**Fields:** `name`, `supplier`, `supplier_name`, `posting_date`, `grand_total`, `outstanding_amount`, `status`

**Child table `items`:** `item_code`, `item_name`, `qty`, `rate`, `amount`, `expense_account`

**Frontend operations:** List, Get (read-only)

**Key components:** `ExpensesPage`, `ExpenseDetailPage`

---

### Journal Entry

Manual accounting entries (salary accruals, adjustments).

**Fields:** `name`, `posting_date`, `voucher_type`, `total_debit`, `total_credit`, `user_remark`, `docstatus`

**Frontend operations:** List (read-only)

**Key components:** `JournalsPage`, `OverviewPage`

---

## System Doctypes

### File

Attachments on documents. Uploaded via `/api/method/upload_file`.

**Fields:** `name`, `file_name`, `file_url`, `file_size`, `is_private`, `creation`, `attached_to_doctype`, `attached_to_name`

**Frontend operations:** List (filtered by `attached_to_doctype`/`attached_to_name`), Create (upload)

**Key components:** `FileAttachments`

---

## Type-Only Doctypes (not actively queried)

These have TypeScript interfaces in `types.ts` but no active queries in current pages:

### Customer

**Fields:** `name`, `customer_name`, `customer_type`, `customer_group`, `territory`, `mobile_no`, `email_id`, `custom_meraki_customer_id`

### Project

**Fields:** `name`, `project_name`, `status`, `sales_order`, `expected_start_date`, `expected_end_date`

---

## Key ERPNext Concepts

| Concept | Description |
|---------|-------------|
| `name` | Every ERPNext record has a unique `name` field (the primary key). For most doctypes it's an auto-generated ID like `CRM-LEAD-00001`. |
| `docstatus` | `0` = Draft, `1` = Submitted, `2` = Cancelled. Submitted docs are immutable — changes require amend-and-resubmit. |
| `custom_` prefix | Custom fields added by us, not part of standard ERPNext. |
| Child tables | Sub-tables on a parent doctype (e.g., Sales Invoice → items). Separate doctypes but displayed inline. |
| `reference_doctype` / `reference_name` | Generic foreign key pattern — a pair of fields that link to any doctype + record name. Used by Communication, Comment, File. |

---

## Frappe API Endpoints Used

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `GET /api/resource/{Doctype}` | List records with filters | All list pages |
| `GET /api/resource/{Doctype}/{name}` | Get single record | All detail pages |
| `POST /api/resource/{Doctype}` | Create record | Opportunity, Communication, Comment |
| `PUT /api/resource/{Doctype}/{name}` | Update record | Employee profile |
| `DELETE /api/resource/{Doctype}/{name}` | Delete record | Lead, Opportunity |
| `POST /api/method/frappe.client.set_value` | Update single field | EditableField, KanbanPage, LeavesPage |
| `POST /api/method/frappe.client.submit` | Submit document | LeavesPage (approve/reject) |
| `POST /api/method/run_doc_method` | Call doctype method | PayrollPage |
| `POST /api/method/upload_file` | Upload file attachment | FileAttachments |

---

## Operations Summary

| Doctype | List | Detail | Create | Update | Delete |
|---------|:----:|:------:|:------:|:------:|:------:|
| Lead | Y | Y | - | Y | Y |
| Opportunity | Y | Y | Y | Y | Y |
| Communication | Y | - | Y | - | - |
| Comment | Y | - | Y | - | - |
| Lead Source | Y | - | - | - | - |
| Employee | Y | Y | - | Y | - |
| Leave Application | Y | - | - | Y | - |
| Leave Allocation | Y | - | - | Y | - |
| Employee Onboarding | Y | Y | - | - | - |
| Payroll Entry | Y | - | Y | - | - |
| Salary Slip | Y | - | - | - | - |
| Sales Invoice | Y | Y | - | - | - |
| Sales Order | Y | - | - | - | - |
| Payment Entry | Y | Y | - | - | - |
| Purchase Invoice | Y | Y | - | - | - |
| Journal Entry | Y | - | - | - | - |
| File | Y | - | Y | - | - |
