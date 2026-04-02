# Leave Business Logic

This document describes the leave management rules for Meraki Wedding Planner, implemented in `webhook_v2/routers/leaves.py`.

---

## Leave Type: Annual Leave (AL)

The only leave type with balance tracking and auto-split logic. All other leave types (Leave Without Pay, etc.) are passed through directly to ERPNext without any custom balance calculation.

---

## Allocation Periods

Each employee has **two separate Leave Allocation records** per leave year:

| Period | `from_date` | `to_date` | Meaning |
|--------|------------|----------|---------|
| **Old (carry-over)** | `Jan 1` of current year | `Jul 31` of current year | Unused leave carried over from the previous year |
| **New (annual)** | `Jan 1` of current year | `Jul 31` of next year | Fresh annual allocation for the current leave year |

**Classification rule:** An allocation is "old" (carry-over) if its `to_date` year equals its `from_date` year (i.e., it expires within the same calendar year). It is "new" (annual) if `to_date` is in a later year than `from_date`. This rule is stable across all year boundaries.

- Old: `from=2026-01-01`, `to=2026-07-31` → same year → carry-over
- New: `from=2026-01-01`, `to=2027-07-31` → spans into next year → annual

Both allocations start on Jan 1, but the Old allocation expires Jul 31 of the **same** year while the New allocation extends to Jul 31 of the **following** year. This allows ERPNext to count both allocations for H1 (Jan–Jul) leaves, enabling employees to draw from their full combined balance.

---

## Balance Calculation

### Old period (carry-over)

- **Before August 1**: fully available — `old_accrued = old_allocation`
- **From August 1 onwards**: forfeited — `old_accrued = old_taken` (balance becomes 0)

Carry-over days do not accrue monthly — they are either fully available or gone.

### New period (annual allocation)

Accrues monthly from **January 1 of the year the allocation starts in**:

```
new_accrued = ceil(new_allocation × elapsed_months / 12)
```

Where `elapsed_months` = months completed since January 1 of the allocation year (not since August 1).

**Example** (14-day allocation, March 2026):
- Elapsed = 2 months (Jan + Feb)
- `ceil(14 × 2 / 12) = ceil(2.33) = 3 days` accrued

The accrual caps at the full annual allocation (`min(allocation, accrued)`).

### Available balance

```
old_available = max(old_accrued - old_taken - old_pending, 0)
new_available = max(new_accrued - new_taken - new_pending, 0)
```

`old_pending` and `new_pending` count Open (not yet approved) leave applications.

**Combined balance for apply/preview:** `old_available + new_available` — both periods contribute. The `new_accrued` is computed as of the leave's `from_date`, not today, so a March preview of a May leave correctly reflects 4 months accrued (not 2).

Since both allocations now cover H1 dates (Old: Jan–Jul; New: Jan–Jul+), ERPNext can accept AL applications up to the full combined balance for any date in the year.

### Overflow tracking

If `old_taken > old_allocation` (employee exhausted carry-over and used new-period days in H1), the excess is re-attributed to `new_taken`:

```
overflow = max(0, old_taken − old_allocation)
old_taken  = min(old_taken, old_allocation)
new_taken += overflow
```

This keeps the per-period balance display accurate.

---

## Working Day Counting

**Weekends (Saturday and Sunday) are always excluded** — hardcoded in `_is_working_day`:

```python
def _is_working_day(d, holidays, weekly_off):
    return d.weekday() < 5 and d.isoformat() not in holidays
```

**Public holidays** are excluded via the ERPNext Holiday List (`Vietnam {year}`). The holiday list contains:
- All Sundays (weekly off)
- All Saturdays (added as individual entries)
- Official Vietnamese public holidays (see table below)

The Annual Leave type has `include_holiday = 0` in ERPNext, meaning ERPNext itself also excludes holidays when counting leave days.

### 2026 Vietnamese Public Holidays

| Date | Holiday |
|------|---------|
| Jan 1 | New Year's Day |
| Feb 17–20 | Tết Nguyên Đán (Lunar New Year) × 4 days |
| Apr 12 | Hung Kings' Commemoration Day |
| Apr 30 | Reunification Day |
| May 1 | International Labour Day |
| Sep 2 | National Day |
| Sep 3 | National Day (additional holiday) |

Admins can add or remove holidays at **Settings → Holidays** in the admin panel. Weekends are managed automatically and do not appear in that list.

---

## Leave Preview

Endpoint: `GET /inquiry-api/leave/preview`

Returns a breakdown before the employee submits:

```
{total_weekdays} weekdays − {holidays_excluded} public holidays = {requested_days} leave days
```

- `total_weekdays`: Mon–Fri count across the requested date range (no holidays excluded)
- `holidays_excluded`: public holidays that fall on weekdays within the range
- `requested_days`: actual leave days consumed = `total_weekdays − holidays_excluded`
- `casual_balance`: available AL balance for the relevant period
- `needs_split`: whether the request exceeds available balance (triggers AL + LWP split)

---

## Auto-Split: Annual Leave + Leave Without Pay

When an employee's AL balance is insufficient for the full request, the system **automatically splits** into two applications:

```
[--- AL days ---][--- LWP days ---]
     ↑                 ↑
  balance_days     remaining days
```

### Split rules

1. **Zero balance** (`balance_days == 0`): entire request becomes LWP
2. **Partial balance** (`0 < balance_days < requested`): first `balance_days` working days → AL, remaining → LWP
3. **Sufficient balance** (`balance_days >= requested`): single AL application, no split

`balance_days = int(math.floor(balance * 2) / 2)` — rounded down to the nearest 0.5 day to support half-day balances without truncating 0.5 to 0.

### Rollback safety

If the AL application is created successfully but the LWP application fails, the AL application is automatically deleted to avoid a dangling partial application.

### Half-day leaves

The `half_day` flag is only passed to ERPNext when `from_date == to_date` (single-day application). For multi-day split segments, `half_day` is always `False` — passing `half_day=1` on a multi-day application tells ERPNext the entire application is 0.5 days, which would be wrong.

---

## Leave Application Lifecycle

```
Employee submits → Open (draft)
                      ↓
              Manager approves → Approved (submitted, docstatus=1)
                      ↓
                  Deducted from allocation balance
```

- **Open** (pending): counted in `old_pending` / `new_pending` — reduces available balance shown to employee
- **Approved**: counted in `old_taken` / `new_taken`
- **Rejected**: excluded from all balance calculations
- **Cancelled** (docstatus=2): excluded from all balance calculations

---

## Leave Report

`/reports/leaves` shows a team-wide table with:

- Monthly breakdown of leave taken (Jan–Dec columns)
- **2025 carry-over**: Allocation, Taken, Balance
- **2026 annual**: Allocation, Taken, Balance
- **2026 Usable**: `ceil(allocation × elapsed_months / 12) − taken` — updates automatically each month

---

## Notifications

Two notification systems fire when leave applications are created/approved/rejected:

### 1. Email Notifications (ERPNext Notification doctype)

- **"Leave Application Submitted for Approval"** — channel: Email, event: New, sent to leave approver
- **"Leave Application Rejected"** — channel: Email, event: Submit, sent to employee
- Both have rich HTML templates with leave type, dates, days, reason

### 2. PWA Notifications (in-app bell icon)

Created by HRMS's `PWANotificationsMixin` in `hrms/mixins/pwa_notifications.py`:

- `notify_approver()` — fires on `after_insert` → creates PWA Notification to `leave_approver`
- `notify_approval_status()` — fires on `on_submit` → creates PWA Notification to employee

**HRMS default messages are generic** (no leave type, dates, or days), so `webhook_v2/routers/leaves.py` enriches the PWA Notification immediately after creation/approval/rejection:

| Action | Enriched message format |
|--------|------------------------|
| Apply | `"Thục Anh requests Annual Leave: Apr 7 – Apr 11 (3 days) — Family event"` |
| Approve | `"Your Annual Leave (Apr 7 – Apr 11, 3 days) has been Approved by Hoàng"` |
| Reject | `"Your Annual Leave (Apr 7 – Apr 11, 3 days) has been Rejected by Hoàng"` |

The enrichment helper `_enrich_leave_notification()` queries the most recent PWA Notification matching `reference_document_name = {leave_app_name}` and updates its `message` field.

### Notification action handling

The `handle_notification_action` Server Script processes Approve/Reject clicks from the notification panel. For Leave Application: directly updates status via `frappe.db.set_value`.

Employee IDs in messages are resolved to real names by the `get_my_notifications` Server Script at read time.

---

## Key Implementation Files

| File | Purpose |
|------|---------|
| `webhook_v2/routers/leaves.py` | All leave balance, preview, apply, approve/reject logic + notification enrichment |
| `webhook_v2/routers/holidays.py` | Holiday list CRUD endpoints |
| `refinefrontend/src/pages/self-service/MyLeavesPage.tsx` | Employee self-service leave view and apply form |
| `refinefrontend/src/components/leave/RequestLeaveSheet.tsx` | Shared leave request form (bottom sheet) |
| `refinefrontend/src/pages/reports/LeaveReportPage.tsx` | HR leave report (all employees) |
| `refinefrontend/src/pages/notifications/NotificationsPage.tsx` | In-app notification bell and action handling |
| `refinefrontend/src/pages/admin/SettingsPage.tsx` | Holiday management tab |

---

## ERPNext Configuration Required

| Setting | Value | Where |
|---------|-------|-------|
| `include_holiday` | `0` (off) | Leave Type → Annual Leave |
| Company default holiday list | `Vietnam {year}` | Company → Meraki Wedding Planner |
| Holiday list contents | All Saturdays + Sundays + public holidays | HR → Holiday List → Vietnam 2026 |

---

## Known Limitations

- **Cross-boundary leaves** (e.g. Jul 28 – Aug 5 spanning the Aug 1 cutoff) are classified entirely by `from_date`. Days falling after Aug 1 are still charged to the old period in the balance display. In practice the frontend prevents this.
- **Mid-year new hires**: accrual always starts from Jan 1 of the allocation year. If a new hire's allocation was pro-rated at creation (e.g. 7/12 of annual for a June hire), this is handled by setting a lower `new_leaves_allocated` value, not by adjusting the accrual start date.
- **`half_day_date`** field is not explicitly passed to ERPNext (ERPNext infers it for single-day applications).
