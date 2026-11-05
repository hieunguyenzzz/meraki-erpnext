import { useCallback, useEffect, useState } from "react";
import { MeTabs } from "@/components/MeTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PayslipsDesktop } from "./my-payroll/PayslipsDesktop";
import { PayslipsMobile } from "./my-payroll/PayslipsMobile";
import type { MySlipsResponse } from "./my-payroll/types";

export default function MyPayrollPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [response, setResponse] = useState<MySlipsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((isCancelled: () => boolean) => {
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
      .then((json: MySlipsResponse) => { if (!isCancelled()) setResponse(json); })
      .catch((err: Error) => {
        console.error("MyPayrollPage: failed to load /inquiry-api/payroll/my-slips", err);
        if (!isCancelled()) setError(err.message || "Failed to load payslips");
      })
      .finally(() => { if (!isCancelled()) setIsLoading(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  const retry = () => load(() => false);

  return (
    <div className="flex max-w-5xl flex-col gap-5 pb-28 max-md:mx-auto md:pb-8">
      <div className="md:hidden">
        <h1 className="font-display text-3xl font-semibold tracking-tight">My Payroll</h1>
        <p className="text-muted-foreground">Your submitted payslips</p>
      </div>
      <h1 className="font-display text-4xl font-semibold leading-10 max-md:hidden">Me</h1>
      <MeTabs active="payslips" />

      {isLoading && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-card" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <StatePanel kind="error" title="Couldn't load payslips" text={error} action={{ label: "Try again", onClick: retry }} />
      )}

      {!isLoading && !error && response?.employee === null && (
        <StatePanel kind="empty" title="No employee record" text="Your account isn't linked to an employee record. Contact HR." />
      )}

      {!isLoading && !error && response?.employee && response.data.length === 0 && (
        <StatePanel kind="empty" title="No payslips yet." text="Your payslips appear here once payroll is submitted." />
      )}

      {!isLoading && !error && response?.employee && response.data.length > 0 &&
        (isDesktop ? (
          <PayslipsDesktop slips={response.data} commissionComponents={response.commission_components} />
        ) : (
          <PayslipsMobile slips={response.data} commissionComponents={response.commission_components} />
        ))}
    </div>
  );
}
