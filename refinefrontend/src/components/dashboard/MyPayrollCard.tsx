import { useEffect, useState } from "react";
import { StatTile } from "@/components/dashboard/StatTile";
import { formatVNDCompact } from "@/lib/format";

interface MySlip {
  name: string;
  start_date: string;
  net_pay: number;
}

/** Latest payslip as a stat tile; renders nothing when the person has no slips. */
export default function MyPayrollCard() {
  const [slip, setSlip] = useState<MySlip | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/inquiry-api/payroll/my-slips", { credentials: "include" })
      .then((r) => {
        if (!r.ok) {
          console.error(`MyPayrollCard: /inquiry-api/payroll/my-slips returned ${r.status}`);
          return { data: [] as MySlip[] };
        }
        return r.json() as Promise<{ data: MySlip[] }>;
      })
      .then((json) => { if (!cancelled) setSlip(json.data?.[0] ?? null); })
      .catch((err: unknown) => {
        console.error("MyPayrollCard: failed to load /inquiry-api/payroll/my-slips", err);
        if (!cancelled) setSlip(null);
      });
    return () => { cancelled = true; };
  }, []);

  if (slip === null) return null;
  return (
    <StatTile
      label="Payslip"
      to="/my-payroll"
      value={slip ? formatVNDCompact(slip.net_pay) : null}
      sub={slip ? `net, ${slip.start_date.slice(0, 7)}` : undefined}
    />
  );
}
