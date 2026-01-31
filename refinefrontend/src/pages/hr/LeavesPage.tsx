import { useState } from "react";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";

const LEAVE_STATUSES = ["All", "Open", "Approved", "Rejected"];

function statusVariant(status: string) {
  switch (status) {
    case "Approved": return "success" as const;
    case "Rejected": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function LeavesPage() {
  const [status, setStatus] = useState("All");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  const { result: appsResult } = useList({
    resource: "Leave Application",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    filters: status !== "All" ? [{ field: "status", operator: "eq", value: status }] : [],
    meta: { fields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "docstatus"] },
  });

  const { result: allocsResult } = useList({
    resource: "Leave Allocation",
    pagination: { mode: "off" },
    sorters: [{ field: "employee_name", order: "asc" }],
    filters: [{ field: "docstatus", operator: "eq", value: 1 }],
    meta: { fields: ["name", "employee", "employee_name", "leave_type", "new_leaves_allocated", "from_date", "to_date"] },
  });

  const leaveApps = appsResult?.data ?? [];
  const leaveAllocs = allocsResult?.data ?? [];

  async function handleApprove(appName: string) {
    setProcessingId(appName);
    setError(null);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype: "Leave Application", name: appName, fieldname: "status", value: "Approved" },
      });
      await customMutation({
        url: "/api/method/frappe.client.submit",
        method: "post",
        values: { doctype: "Leave Application", name: appName },
      });
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
    } catch (err) {
      console.error("Failed to approve:", err);
      setError(`Failed to approve ${appName}. Please try again.`);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(appName: string) {
    setProcessingId(appName);
    setError(null);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype: "Leave Application", name: appName, fieldname: "status", value: "Rejected" },
      });
      await customMutation({
        url: "/api/method/frappe.client.submit",
        method: "post",
        values: { doctype: "Leave Application", name: appName },
      });
      invalidate({ resource: "Leave Application", invalidates: ["list"] });
    } catch (err) {
      console.error("Failed to reject:", err);
      setError(`Failed to reject ${appName}. Please try again.`);
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Leave Management</h1>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Leave Applications ({leaveApps.length})</CardTitle>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {leaveApps.length === 0 ? (
                <p className="text-muted-foreground">No leave applications found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveApps.map((app: any) => (
                      <TableRow key={app.name}>
                        <TableCell className="font-medium">{app.employee_name}</TableCell>
                        <TableCell>{app.leave_type}</TableCell>
                        <TableCell>{formatDate(app.from_date)}</TableCell>
                        <TableCell>{formatDate(app.to_date)}</TableCell>
                        <TableCell className="text-right">{app.total_leave_days}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(app.status)}>{app.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {app.docstatus === 0 && app.status === "Open" && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleApprove(app.name)} disabled={processingId === app.name}>
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleReject(app.name)} disabled={processingId === app.name}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <CardTitle>Leave Allocations ({leaveAllocs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {leaveAllocs.length === 0 ? (
                <p className="text-muted-foreground">No leave allocations found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveAllocs.map((alloc: any) => (
                      <TableRow key={alloc.name}>
                        <TableCell className="font-medium">{alloc.employee_name}</TableCell>
                        <TableCell>{alloc.leave_type}</TableCell>
                        <TableCell className="text-right">{alloc.new_leaves_allocated}</TableCell>
                        <TableCell>{formatDate(alloc.from_date)}</TableCell>
                        <TableCell>{formatDate(alloc.to_date)}</TableCell>
                      </TableRow>
                    ))}
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
