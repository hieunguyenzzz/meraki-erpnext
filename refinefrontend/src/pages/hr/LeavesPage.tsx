import { useState, useMemo } from "react";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { formatDate } from "@/lib/format";

function statusVariant(status: string) {
  switch (status) {
    case "Approved": return "success" as const;
    case "Rejected": return "destructive" as const;
    default: return "secondary" as const;
  }
}

interface LeaveApp {
  name: string;
  employee: string;
  employee_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  status: string;
  docstatus: number;
}

interface AllocEdit {
  allocated?: number;
  remaining?: number;
  editedField?: "allocated" | "remaining";
}

export default function LeavesPage() {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, AllocEdit>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // --- Applications tab data ---
  const { result: appsResult, query: appsQuery } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: { fields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "docstatus"] },
  });

  // --- Balances tab data ---
  const { result: allocsResult } = useList({
    resource: "Leave Allocation",
    pagination: { mode: "off" },
    sorters: [{ field: "employee_name", order: "asc" }],
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: { fields: ["name", "employee", "employee_name", "leave_type", "new_leaves_allocated", "total_leaves_allocated", "from_date", "to_date"] },
  });

  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name"] },
  });

  const { result: approvedAppsResult } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    filters: [
      { field: "status", operator: "eq", value: "Approved" },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "employee", "leave_type", "total_leave_days"] },
  });

  const leaveApps = (appsResult?.data ?? []) as LeaveApp[];
  const leaveAllocs = (allocsResult?.data ?? []) as any[];
  const employees = (employeesResult?.data ?? []) as any[];
  const approvedApps = (approvedAppsResult?.data ?? []) as any[];

  // Build lookup: employee -> leave_type -> taken days
  const takenMap = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const app of approvedApps) {
      if (!m.has(app.employee)) m.set(app.employee, new Map());
      const byType = m.get(app.employee)!;
      byType.set(app.leave_type, (byType.get(app.leave_type) ?? 0) + (app.total_leave_days ?? 0));
    }
    return m;
  }, [approvedApps]);

  const allocsByEmployee = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const alloc of leaveAllocs) {
      if (!m.has(alloc.employee)) m.set(alloc.employee, []);
      m.get(alloc.employee)!.push(alloc);
    }
    return m;
  }, [leaveAllocs]);

  const balanceRows = useMemo(() => {
    const rows: Array<{
      employeeId: string;
      employeeName: string;
      allocName: string | null;
      leaveType: string | null;
      allocated: number;
      taken: number;
      remaining: number;
    }> = [];

    const sortedEmployees = [...employees].sort((a, b) =>
      (a.employee_name ?? "").localeCompare(b.employee_name ?? "")
    );

    for (const emp of sortedEmployees) {
      const allocs = allocsByEmployee.get(emp.name);
      if (allocs && allocs.length > 0) {
        for (const alloc of allocs) {
          const allocated = alloc.total_leaves_allocated ?? alloc.new_leaves_allocated ?? 0;
          const taken = takenMap.get(emp.name)?.get(alloc.leave_type) ?? 0;
          rows.push({
            employeeId: emp.name, employeeName: emp.employee_name,
            allocName: alloc.name, leaveType: alloc.leave_type,
            allocated, taken, remaining: allocated - taken,
          });
        }
      } else {
        rows.push({
          employeeId: emp.name, employeeName: emp.employee_name,
          allocName: null, leaveType: null, allocated: 0, taken: 0, remaining: 0,
        });
      }
    }
    return rows;
  }, [employees, allocsByEmployee, takenMap]);

  // --- Edit helpers ---
  function getDisplayValues(row: typeof balanceRows[0]) {
    if (!row.allocName) return { allocated: null, remaining: null };
    const edit = edits[row.allocName];
    if (!edit) return { allocated: row.allocated, remaining: row.remaining };
    if (edit.editedField === "allocated") {
      const alloc = edit.allocated ?? row.allocated;
      return { allocated: alloc, remaining: alloc - row.taken };
    }
    if (edit.editedField === "remaining") {
      const rem = edit.remaining ?? row.remaining;
      return { allocated: rem + row.taken, remaining: rem };
    }
    return { allocated: row.allocated, remaining: row.remaining };
  }

  function handleAllocatedChange(allocName: string, value: string) {
    const num = value === "" ? 0 : parseFloat(value);
    if (isNaN(num)) return;
    setEdits((prev) => ({ ...prev, [allocName]: { allocated: num, editedField: "allocated" } }));
  }

  function handleRemainingChange(allocName: string, value: string) {
    const num = value === "" ? 0 : parseFloat(value);
    if (isNaN(num)) return;
    setEdits((prev) => ({ ...prev, [allocName]: { remaining: num, editedField: "remaining" } }));
  }

  function isEdited(allocName: string) {
    return allocName in edits;
  }

  async function handleSaveAllocation(allocName: string, taken: number) {
    const edit = edits[allocName];
    if (!edit) return;
    let newAllocated: number;
    if (edit.editedField === "allocated") {
      newAllocated = edit.allocated ?? 0;
    } else {
      newAllocated = (edit.remaining ?? 0) + taken;
    }
    setSavingId(allocName);
    setError(null);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype: "Leave Allocation", name: allocName, fieldname: "total_leaves_allocated", value: newAllocated },
      });
      setEdits((prev) => { const next = { ...prev }; delete next[allocName]; return next; });
      invalidate({ resource: "Leave Allocation", invalidates: ["list"] });
    } catch (err: any) {
      setError(`Failed to update ${allocName}. ${err?.message ?? "Please try again."}`);
    } finally {
      setSavingId(null);
    }
  }

  async function handleApprove(appName: string) {
    setProcessingId(appName);
    setError(null);
    try {
      await customMutation({ url: "/api/method/frappe.client.set_value", method: "post", values: { doctype: "Leave Application", name: appName, fieldname: "status", value: "Approved" } });
      await customMutation({ url: "/api/method/frappe.client.submit", method: "post", values: { doctype: "Leave Application", name: appName } });
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
    } catch { setError(`Failed to approve ${appName}. Please try again.`); } finally { setProcessingId(null); }
  }

  async function handleReject(appName: string) {
    setProcessingId(appName);
    setError(null);
    try {
      await customMutation({ url: "/api/method/frappe.client.set_value", method: "post", values: { doctype: "Leave Application", name: appName, fieldname: "status", value: "Rejected" } });
      await customMutation({ url: "/api/method/frappe.client.submit", method: "post", values: { doctype: "Leave Application", name: appName } });
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
    } catch { setError(`Failed to reject ${appName}. Please try again.`); } finally { setProcessingId(null); }
  }

  // --- DataTable columns for Applications tab ---
  const appColumns: ColumnDef<LeaveApp, unknown>[] = [
    {
      accessorKey: "employee_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
      cell: ({ row }) => <span className="font-medium">{row.original.employee_name}</span>,
      filterFn: "includesString",
    },
    {
      accessorKey: "leave_type",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Leave Type" />,
      filterFn: "arrIncludesSome",
    },
    {
      accessorKey: "from_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="From" />,
      cell: ({ row }) => formatDate(row.original.from_date),
    },
    {
      accessorKey: "to_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="To" />,
      cell: ({ row }) => formatDate(row.original.to_date),
    },
    {
      accessorKey: "total_leave_days",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Days" className="text-right" />,
      cell: ({ row }) => <div className="text-right">{row.original.total_leave_days}</div>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>,
      filterFn: "arrIncludesSome",
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const app = row.original;
        if (app.docstatus === 0 && app.status === "Open") {
          return (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleApprove(app.name)} disabled={processingId === app.name}>Approve</Button>
              <Button size="sm" variant="destructive" onClick={() => handleReject(app.name)} disabled={processingId === app.name}>Reject</Button>
            </div>
          );
        }
        return null;
      },
      enableSorting: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
        <p className="text-muted-foreground">Applications and balance tracking</p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium hover:text-red-900">&times;</button>
        </div>
      )}

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <DataTable
            columns={appColumns}
            data={leaveApps}
            isLoading={appsQuery.isLoading}
            searchKey="employee_name"
            searchPlaceholder="Search by employee..."
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
              {
                id: "leave_type",
                title: "Leave Type",
                options: [
                  { label: "Annual Leave", value: "Annual Leave" },
                  { label: "Sick Leave", value: "Sick Leave" },
                  { label: "Casual Leave", value: "Casual Leave" },
                ],
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <CardTitle>Leave Balances ({employees.length} employees)</CardTitle>
            </CardHeader>
            <CardContent>
              {employees.length === 0 ? (
                <p className="text-muted-foreground">No active employees found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Taken</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balanceRows.map((row) => {
                      const key = row.allocName ?? row.employeeId;
                      const hasAlloc = !!row.allocName;
                      const display = getDisplayValues(row);
                      const edited = hasAlloc && isEdited(row.allocName!);
                      const saving = savingId === row.allocName;

                      return (
                        <TableRow key={key} className={!hasAlloc ? "text-muted-foreground" : undefined}>
                          <TableCell className="font-medium">{row.employeeName}</TableCell>
                          <TableCell>{row.leaveType ?? "\u2014"}</TableCell>
                          <TableCell className="text-right">
                            {hasAlloc ? (
                              <Input type="number" min={0} step={0.5} className="w-20 text-right ml-auto" value={display.allocated ?? 0} onChange={(e) => handleAllocatedChange(row.allocName!, e.target.value)} disabled={saving} />
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell className="text-right">{hasAlloc ? row.taken : "\u2014"}</TableCell>
                          <TableCell className="text-right">
                            {hasAlloc ? (
                              <Input type="number" min={0} step={0.5} className="w-20 text-right ml-auto" value={display.remaining ?? 0} onChange={(e) => handleRemainingChange(row.allocName!, e.target.value)} disabled={saving} />
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {hasAlloc && edited && (
                              <Button size="sm" onClick={() => handleSaveAllocation(row.allocName!, row.taken)} disabled={saving}>
                                {saving ? "Saving..." : "Save"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
