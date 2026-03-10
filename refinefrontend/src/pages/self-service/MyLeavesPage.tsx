import { useState, useMemo, useEffect } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Calendar } from "lucide-react";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";

interface LeaveApplication {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  status: string;
  description: string;
  docstatus: number;
}

/** Parse YYYY-MM-DD → Date in local timezone */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

interface LeaveType {
  name: string;
}

interface LeaveAllocation {
  name: string;
  leave_type: string;
  total_leaves_allocated: number;
  new_leaves_allocated: number;
  from_date: string;
  to_date: string;
}

function statusVariant(status: string) {
  switch (status) {
    case "Approved":
      return "success" as const;
    case "Rejected":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

const initialForm = {
  leave_type: "",
  from_date: "",
  to_date: "",
  half_day: false,
  half_day_period: "" as "" | "AM" | "PM",
  description: "",
};


export default function MyLeavesPage() {
  const { employee, employeeId, isLoading: employeeLoading } = useMyEmployee();
  const invalidate = useInvalidate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch leave types
  const { result: leaveTypesResult } = useList<LeaveType>({
    resource: "Leave Type",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const leaveTypes = (leaveTypesResult?.data ?? []) as LeaveType[];

  // Fetch user's leave applications
  const { result: appsResult, query: appsQuery } = useList<LeaveApplication>({
    resource: "Leave Application",
    filters: employeeId
      ? [{ field: "employee", operator: "eq", value: employeeId }]
      : [],
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name",
        "leave_type",
        "from_date",
        "to_date",
        "total_leave_days",
        "status",
        "description",
        "docstatus",
      ],
    },
    queryOptions: { enabled: !!employeeId },
  });
  const leaveApps = (appsResult?.data ?? []) as LeaveApplication[];

  // Fetch leave balances from backend (computed as admin, avoids field permission issues)
  const [balanceData, setBalanceData] = useState<{ data: any[]; before_august: boolean } | null>(null);
  useEffect(() => {
    if (!employeeId) return;
    fetch(`/inquiry-api/leave/balance?employee=${employeeId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setBalanceData)
      .catch(() => setBalanceData(null));
  }, [employeeId]);

  const leaveBalances = useMemo(() => {
    if (!balanceData?.data) return [];
    const beforeAugust = balanceData.before_august;

    return balanceData.data.map((item: any) => {
      const oldAllocDays = item.old_allocation ?? 0;
      const newAllocDays = item.new_allocation ?? 0;
      const rawOldTaken = item.old_taken ?? 0;
      const oldPending = item.old_pending ?? 0;
      const newTaken = item.new_taken ?? 0;
      const newPending = item.new_pending ?? 0;

      // Accrued amounts from backend (fall back to full allocation if missing)
      const oldAccrued = item.old_accrued ?? oldAllocDays;
      const newAccrued = item.new_accrued ?? newAllocDays;

      // Apply overflow: cap old taken at old allocation
      const cappedOldTaken = Math.min(rawOldTaken, oldAllocDays);
      const overflow = rawOldTaken - cappedOldTaken;

      // Cap usable at accrued amount
      const oldBalance = Math.min(oldAccrued, oldAllocDays) - cappedOldTaken - oldPending;
      const effectiveNewTaken = newTaken + overflow;
      const newBalance = Math.min(newAccrued, newAllocDays) - effectiveNewTaken - newPending;

      return {
        leaveType: item.leave_type,
        showOldPeriod: beforeAugust && oldAllocDays > 0,
        oldAllocDays,
        oldAccrued,
        oldTaken: cappedOldTaken,
        oldPending,
        oldBalance: Math.max(0, oldBalance),
        newAllocDays,
        newAccrued,
        newTaken: effectiveNewTaken,
        newPending,
        newBalance: Math.max(0, newBalance),
        totalBalance: Math.max(0, oldBalance) + Math.max(0, newBalance),
      };
    });
  }, [balanceData]);

  // Backend-driven split preview for Casual Leave (holiday-aware)
  const [splitPreview, setSplitPreview] = useState<{
    requested_days: number;
    total_weekdays: number;
    holidays_excluded: { date: string; description: string }[];
    casual_balance: number;
    needs_split: boolean;
    casual_days: number;
    lwp_days: number;
    casual_to_date: string | null;
    lwp_from_date: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitStep, setSubmitStep] = useState<string | null>(null);

  useEffect(() => {
    if (form.leave_type !== "Casual Leave" || !form.from_date || !form.to_date || !employeeId) {
      setSplitPreview(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({
          employee: employeeId,
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
        });
        const res = await fetch(`/inquiry-api/leave/preview?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setSplitPreview(data);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSplitPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.leave_type, form.from_date, form.to_date, employeeId]);

  // Table columns
  const columns: ColumnDef<LeaveApplication, unknown>[] = [
    {
      accessorKey: "leave_type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Leave Type" />
      ),
    },
    {
      accessorKey: "from_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="From" />
      ),
      cell: ({ row }) => formatDate(row.original.from_date),
    },
    {
      accessorKey: "to_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="To" />
      ),
      cell: ({ row }) => formatDate(row.original.to_date),
    },
    {
      accessorKey: "total_leave_days",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Days"
          className="text-right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right">{row.original.total_leave_days}</div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
      filterFn: "arrIncludesSome",
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Reason" />
      ),
      cell: ({ row }) => (
        <span className="truncate max-w-[200px] block">
          {row.original.description || "-"}
        </span>
      ),
    },
  ];

  function resetForm() {
    setForm(initialForm);
    setError(null);
    setSuccess(null);
    setSplitPreview(null);
    setSubmitStep(null);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  }

  async function fetchLeaveApply(payload: {
    employee: string;
    leave_type: string;
    from_date: string;
    to_date: string;
    description: string;
  }) {
    const res = await fetch("/inquiry-api/leave/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? "Failed to submit leave request");
    }
    return res.json();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !form.leave_type || !form.from_date || !form.to_date) {
      setError("Please fill in all required fields");
      return;
    }
    if (new Date(form.from_date) > new Date(form.to_date)) {
      setError("From date cannot be after To date");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    setSubmitStep(null);

    const basePayload = {
      employee: employeeId,
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      description: form.description,
      half_day: form.half_day,
      half_day_period: form.half_day ? form.half_day_period : "",
    };

    try {
      if (splitPreview?.needs_split && splitPreview.casual_to_date && splitPreview.lwp_from_date) {
        // Partial balance: submit CL first, then LWP
        setSubmitStep("Submitting Casual Leave…");
        await fetchLeaveApply({
          ...basePayload,
          leave_type: "Casual Leave",
          to_date: splitPreview.casual_to_date,
        });

        setSubmitStep("Submitting Leave Without Pay…");
        try {
          await fetchLeaveApply({
            ...basePayload,
            leave_type: "Leave Without Pay",
            from_date: splitPreview.lwp_from_date,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setError(`Casual Leave was created, but the Leave Without Pay portion failed: ${message}. Please resubmit the remaining days manually.`);
          invalidate({ resource: "Leave Application", invalidates: ["list"] });
          return;
        }

        setSuccess("Both leave requests submitted successfully.");
      } else if (splitPreview?.needs_split && splitPreview.lwp_from_date && !splitPreview.casual_to_date) {
        // Zero CL balance: submit full range as LWP
        setSubmitStep("Submitting Leave Without Pay…");
        await fetchLeaveApply({
          ...basePayload,
          leave_type: "Leave Without Pay",
        });
        setSuccess("Leave request submitted as Leave Without Pay (no Casual Leave balance remaining).");
      } else {
        await fetchLeaveApply(basePayload);
        setSuccess("Leave request submitted successfully.");
      }

      invalidate({ resource: "Leave Application", invalidates: ["list"] });
      setTimeout(() => {
        setDialogOpen(false);
        resetForm();
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit leave request";
      setError(message);
    } finally {
      setIsSubmitting(false);
      setSubmitStep(null);
    }
  }

  if (employeeLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-[200px]" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <p className="text-destructive">
          No employee record found. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Leaves</h1>
          <p className="text-muted-foreground">
            View your leave balance and submit requests
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Request Leave
        </Button>
      </div>

      {/* Leave Balance Cards */}
      {leaveBalances.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {leaveBalances.map((balance) => (
            <Card key={balance.leaveType}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {balance.leaveType}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{balance.totalBalance}</span>
                  <span className="text-sm text-muted-foreground">days available</span>
                </div>
                {balance.showOldPeriod && (
                  <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
                    <div className="flex justify-between">
                      <span>{new Date().getFullYear() - 1} carry-over</span>
                      <span>{balance.oldBalance} / {balance.oldAllocDays} days</span>
                    </div>
                    {balance.oldTaken > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="pl-2">taken</span>
                        <span>{balance.oldTaken}</span>
                      </div>
                    )}
                    {balance.oldPending > 0 && (
                      <div className="flex justify-between text-[11px] text-yellow-600">
                        <span className="pl-2">pending</span>
                        <span>{balance.oldPending}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
                  <div className="flex justify-between">
                    <span>{new Date().getFullYear()} allocation</span>
                    <span>{balance.newBalance} / {balance.newAccrued} days</span>
                  </div>
                  <div className="flex justify-between text-[11px] opacity-60">
                    <span className="pl-2">of {balance.newAllocDays} annual</span>
                  </div>
                  {balance.newTaken > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="pl-2">taken</span>
                      <span>{balance.newTaken}</span>
                    </div>
                  )}
                  {balance.newPending > 0 && (
                    <div className="flex justify-between text-[11px] text-yellow-600">
                      <span className="pl-2">pending</span>
                      <span>{balance.newPending}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {leaveBalances.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-center">
              No leave allocations found. Contact HR if you believe this is an
              error.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Leave Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            My Leave Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={leaveApps}
            isLoading={appsQuery.isLoading}
            filterableColumns={[
              {
                id: "status",
                title: "Status",
                options: [
                  { label: "Open", value: "Open" },
                  { label: "Approved", value: "Approved" },
                  { label: "Rejected", value: "Rejected" },
                ],
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Request Leave Sheet */}
      <Sheet open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Request Leave</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                  {success}
                </div>
              )}

              <div>
                <Label htmlFor="leave_type">Leave Type *</Label>
                <Select
                  value={form.leave_type}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, leave_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((lt) => (
                      <SelectItem key={lt.name} value={lt.name}>
                        {lt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="from_date">From Date *</Label>
                  <Input
                    id="from_date"
                    type="date"
                    value={form.from_date}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        from_date: e.target.value,
                        ...(prev.half_day ? { to_date: e.target.value } : {}),
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="to_date">To Date *</Label>
                  <Input
                    id="to_date"
                    type="date"
                    value={form.to_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, to_date: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Half Day toggle */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.half_day}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((prev) => ({
                        ...prev,
                        half_day: checked,
                        half_day_period: checked ? "AM" : "",
                        // Half day = single day, sync to_date
                        ...(checked && prev.from_date ? { to_date: prev.from_date } : {}),
                      }));
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Half Day</span>
                </label>
                {form.half_day && (
                  <div className="flex gap-2">
                    {(["AM", "PM"] as const).map((period) => (
                      <label key={period} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="half_day_period"
                          value={period}
                          checked={form.half_day_period === period}
                          onChange={() => setForm((prev) => ({ ...prev, half_day_period: period }))}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-sm">{period}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {previewLoading && form.leave_type === "Casual Leave" && form.from_date && form.to_date && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                  Checking leave balance…
                </div>
              )}

              {!previewLoading && splitPreview && (
                <div className="space-y-2 text-sm">
                  {/* Day count breakdown */}
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-amber-800 dark:text-amber-300 space-y-0.5">
                    <p className="font-medium">Leave breakdown</p>
                    <p>
                      {splitPreview.total_weekdays} weekday{splitPreview.total_weekdays !== 1 ? "s" : ""}
                      {splitPreview.holidays_excluded.length > 0 && (
                        <> − {splitPreview.holidays_excluded.length} public holiday{splitPreview.holidays_excluded.length !== 1 ? "s" : ""} = <strong>{splitPreview.requested_days} leave day{splitPreview.requested_days !== 1 ? "s" : ""}</strong></>
                      )}
                    </p>
                    {splitPreview.holidays_excluded.length > 0 && (
                      <ul className="list-disc list-inside pl-1 text-xs opacity-80">
                        {splitPreview.holidays_excluded.map((h) => (
                          <li key={h.date}>{h.description} ({new Date(h.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })})</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Two-panel split display (partial balance) */}
                  {splitPreview.needs_split && splitPreview.casual_to_date && (
                    <div className="space-y-2">
                      <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-blue-800 dark:text-blue-300">
                        <p className="font-semibold text-xs uppercase tracking-wide mb-1">Request 1 — Casual Leave (paid)</p>
                        <p>
                          {formatDate(form.from_date)} → {formatDate(splitPreview.casual_to_date)}
                          {" · "}<strong>{splitPreview.casual_days} day{splitPreview.casual_days !== 1 ? "s" : ""}</strong>
                        </p>
                      </div>
                      <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 px-4 py-3 text-orange-800 dark:text-orange-300">
                        <p className="font-semibold text-xs uppercase tracking-wide mb-1">Request 2 — Leave Without Pay (unpaid)</p>
                        <p>
                          {splitPreview.lwp_from_date ? formatDate(splitPreview.lwp_from_date) : "—"} → {formatDate(form.to_date)}
                          {" · "}<strong>{splitPreview.lwp_days} day{splitPreview.lwp_days !== 1 ? "s" : ""}</strong>
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your Casual Leave balance is {splitPreview.casual_balance} day{splitPreview.casual_balance !== 1 ? "s" : ""}. The remaining {splitPreview.lwp_days} day{splitPreview.lwp_days !== 1 ? "s" : ""} will be unpaid.
                      </p>
                    </div>
                  )}

                  {/* Zero balance: full LWP */}
                  {splitPreview.needs_split && !splitPreview.casual_to_date && (
                    <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 px-4 py-3 text-orange-800 dark:text-orange-300 space-y-1">
                      <p className="font-semibold text-xs uppercase tracking-wide">Leave Without Pay (unpaid)</p>
                      <p>
                        {formatDate(form.from_date)} → {formatDate(form.to_date)}
                        {" · "}<strong>{splitPreview.lwp_days} day{splitPreview.lwp_days !== 1 ? "s" : ""}</strong>
                      </p>
                      <p className="text-xs opacity-80">Your Casual Leave balance is exhausted. This leave will be fully unpaid.</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="description">Reason</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Optional: Describe the reason for your leave"
                  rows={3}
                />
              </div>
            </div>

            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? (submitStep ?? "Submitting…")
                  : splitPreview?.needs_split && splitPreview.casual_to_date
                    ? "Submit Both Requests"
                    : "Submit Request"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
