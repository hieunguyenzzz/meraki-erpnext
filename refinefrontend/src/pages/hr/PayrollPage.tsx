import { useState } from "react";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatVND, formatDate } from "@/lib/format";
import { extractErrorMessage } from "@/lib/errors";

function now() {
  return new Date();
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function firstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfMonth(d: Date) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function docstatusLabel(ds: number) {
  switch (ds) {
    case 0: return "Draft";
    case 1: return "Submitted";
    case 2: return "Cancelled";
    default: return "Unknown";
  }
}

function docstatusBadge(ds: number) {
  switch (ds) {
    case 0: return "secondary" as const;
    case 1: return "success" as const;
    case 2: return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function PayrollPage() {
  const today = now();
  const start = firstOfMonth(today);
  const end = endOfMonth(today);

  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // Current month Payroll Entry
  const { result: peResult, query: peQuery } = useList({
    resource: "Payroll Entry",
    pagination: { mode: "off" },
    filters: [
      { field: "start_date", operator: "eq", value: start },
      { field: "company", operator: "eq", value: "Meraki Wedding Planner" },
    ],
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: ["name", "posting_date", "start_date", "end_date", "docstatus", "status", "number_of_employees"],
    },
  });

  const payrollEntries = peResult?.data ?? [];
  const currentPE = payrollEntries.length > 0 ? (payrollEntries[0] as any) : null;

  // Salary Slips for current PE
  const { result: slipsResult, query: slipsQuery } = useList({
    resource: "Salary Slip",
    pagination: { mode: "off" },
    filters: currentPE
      ? [{ field: "payroll_entry", operator: "eq", value: currentPE.name }]
      : [{ field: "name", operator: "eq", value: "__never__" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: {
      fields: ["name", "employee", "employee_name", "gross_pay", "net_pay", "posting_date", "docstatus"],
    },
    queryOptions: { enabled: !!currentPE },
  });

  const salarySlips = (slipsResult?.data ?? []) as any[];
  const hasDraftSlips = salarySlips.some((s) => s.docstatus === 0);

  // History: all Payroll Entries
  const { result: histResult } = useList({
    resource: "Payroll Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: {
      fields: ["name", "posting_date", "start_date", "end_date", "docstatus", "status", "number_of_employees"],
    },
  });

  const allEntries = (histResult?.data ?? []) as any[];

  // Active employee count
  const { result: empResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
  });

  const activeCount = empResult?.data?.length ?? 0;

  // --- Generate Payroll ---
  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      // Step 1: Create Payroll Entry
      const createRes = await customMutation({
        url: "/api/resource/Payroll Entry",
        method: "post",
        values: {
          payroll_frequency: "Monthly",
          posting_date: end,
          start_date: start,
          end_date: end,
          company: "Meraki Wedding Planner",
          currency: "VND",
          exchange_rate: 1,
          cost_center: "Main - MWP",
          payment_account: "Cash - MWP",
          payroll_payable_account: "Payroll Payable - MWP",
        },
      });
      const peId = (createRes as any)?.data?.data?.name;
      if (!peId) throw new Error("Failed to create Payroll Entry");

      // Step 2: Fill employee details (returns updated doc with employees)
      const fillRes = await customMutation({
        url: "/api/method/run_doc_method",
        method: "post",
        values: { dt: "Payroll Entry", dn: peId, method: "fill_employee_details" },
      });

      // Step 3: Save the doc to persist the employee list
      const updatedDoc = (fillRes as any)?.data?.docs?.[0];
      if (!updatedDoc) throw new Error("Failed to fill employee details");
      await customMutation({
        url: `/api/resource/Payroll Entry/${peId}`,
        method: "put",
        values: updatedDoc,
      });

      // Step 4: Create salary slips
      await customMutation({
        url: "/api/method/run_doc_method",
        method: "post",
        values: { dt: "Payroll Entry", dn: peId, method: "create_salary_slips" },
      });

      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Salary Slip", invalidates: ["list"] });
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to generate payroll"));
    } finally {
      setGenerating(false);
    }
  }

  // --- Submit All Slips ---
  async function handleSubmitAll() {
    if (!currentPE) return;
    setSubmitting(true);
    setError(null);
    try {
      await customMutation({
        url: "/api/method/run_doc_method",
        method: "post",
        values: { dt: "Payroll Entry", dn: currentPE.name, method: "submit_salary_slips" },
      });
      invalidate({ resource: "Payroll Entry", invalidates: ["list"] });
      invalidate({ resource: "Salary Slip", invalidates: ["list"] });
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to submit salary slips"));
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = peQuery?.isLoading || slipsQuery?.isLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Payroll</h1>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium hover:text-red-900">&times;</button>
        </div>
      )}

      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Current Month</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="current">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {monthLabel(today)} {currentPE ? `- ${currentPE.name}` : ""}
              </CardTitle>
              {!currentPE && !isLoading && (
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? "Generating..." : `Generate Payroll for ${monthLabel(today)}`}
                </Button>
              )}
              {currentPE && hasDraftSlips && (
                <Button onClick={handleSubmitAll} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit All"}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : !currentPE ? (
                <p className="text-muted-foreground">
                  No payroll entry for {monthLabel(today)}. Click "Generate Payroll" to create one
                  for {activeCount} active employees.
                </p>
              ) : salarySlips.length === 0 ? (
                <p className="text-muted-foreground">No salary slips found for this payroll entry.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Gross Pay</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salarySlips.map((slip: any) => (
                      <TableRow key={slip.name}>
                        <TableCell className="font-medium">{slip.employee_name}</TableCell>
                        <TableCell className="text-right">{formatVND(slip.gross_pay)}</TableCell>
                        <TableCell className="text-right">{formatVND(slip.net_pay)}</TableCell>
                        <TableCell>
                          <Badge variant={docstatusBadge(slip.docstatus)}>
                            {docstatusLabel(slip.docstatus)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Payroll History</CardTitle>
            </CardHeader>
            <CardContent>
              {allEntries.length === 0 ? (
                <p className="text-muted-foreground">No payroll entries found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Employees</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Posted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allEntries.map((entry: any) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">
                          {formatDate(entry.start_date)} - {formatDate(entry.end_date)}
                        </TableCell>
                        <TableCell className="text-right">{entry.number_of_employees ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant={docstatusBadge(entry.docstatus)}>
                            {entry.status || docstatusLabel(entry.docstatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(entry.posting_date)}</TableCell>
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
