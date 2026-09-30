import { useEffect, useState } from "react";
import { ChevronDown, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatVND, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SlipLine {
  salary_component: string;
  amount: number;
}

interface MySlip {
  name: string;
  employee: string;
  employee_display_name: string;
  start_date: string;
  end_date: string;
  posting_date: string;
  payroll_entry: string;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  earnings: SlipLine[];
  deductions: SlipLine[];
  si_employee?: number;
  tax_reduction?: number;
  taxable_income?: number;
  dependents?: number;
  is_probation?: boolean;
  pit_method?: string;
}

interface MySlipsResponse {
  employee: { name: string; display_name: string } | null;
  data: MySlip[];
}

// Already netted out of gross_pay by the backend; showing it again as a
// deduction line would double count it.
const HIDDEN_DEDUCTION_COMPONENTS = ["Salary Proration Adj"];

function monthLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function SlipRow({ slip, defaultOpen }: { slip: MySlip; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const visibleDeductions = slip.deductions.filter(
    (d) => !HIDDEN_DEDUCTION_COMPONENTS.includes(d.salary_component)
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="flex-row items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <CardTitle className="text-base">{monthLabel(slip.start_date)}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(slip.start_date)} – {formatDate(slip.end_date)}
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">Gross</p>
                <p className="text-sm font-medium">{formatVND(slip.gross_pay)}</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">Deductions</p>
                <p className="text-sm font-medium">{formatVND(slip.total_deduction)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Net Pay</p>
                <p className="text-sm font-bold">{formatVND(slip.net_pay)}</p>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {(slip.is_probation || slip.pit_method === "Flat 10%") && (
              <div className="flex gap-2">
                {slip.is_probation && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">Probation 85%</Badge>
                )}
                {slip.pit_method === "Flat 10%" && (
                  <Badge variant="outline" className="border-violet-500 text-violet-600 text-xs">Flat 10% PIT</Badge>
                )}
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-2">Earnings</p>
              <div className="space-y-1">
                {slip.earnings.map((e) => (
                  <div key={e.salary_component} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{e.salary_component}</span>
                    <span>{formatVND(e.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-medium border-t pt-1 mt-1">
                  <span>Gross Pay</span>
                  <span>{formatVND(slip.gross_pay)}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Deductions</p>
              <div className="space-y-1">
                {visibleDeductions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No deductions</p>
                ) : (
                  visibleDeductions.map((d) => (
                    <div key={d.salary_component} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{d.salary_component}</span>
                      <span>{formatVND(d.amount)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between text-sm font-medium border-t pt-1 mt-1">
                  <span>Total Deductions</span>
                  <span>{formatVND(slip.total_deduction)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between text-base font-bold border-t pt-3">
              <span>Net Pay</span>
              <span>{formatVND(slip.net_pay)}</span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function MyPayrollPage() {
  const [response, setResponse] = useState<MySlipsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch("/inquiry-api/payroll/my-slips")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Failed to load payslips (${res.status})`);
        }
        return res.json();
      })
      .then((json: MySlipsResponse) => { if (!cancelled) setResponse(json); })
      .catch((err: Error) => { if (!cancelled) setError(err.message || "Failed to load payslips"); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Payroll</h1>
        <p className="text-muted-foreground">Your submitted payslips</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!isLoading && !error && response?.employee === null && (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">
              Your account isn't linked to an employee record. Contact HR.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && response?.employee && response.data.length === 0 && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-2">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground text-center">No payslips yet.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && response?.employee && response.data.length > 0 && (
        <div className="space-y-3">
          {response.data.map((slip, i) => (
            <SlipRow key={slip.name} slip={slip} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
