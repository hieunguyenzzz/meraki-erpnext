import { EditIconButton, FactList, SectionCard } from "@/components/wedding/SectionCard";
import { formatVND } from "@/lib/format";
import type { Employee } from "@/lib/types";
import type { EditSection } from "./types";

interface Props {
  employee: Employee;
  onEdit: (section: EditSection) => void;
}

const pct = (n: number | undefined) => `${n}%`;

/** Commission structure: Lead/Support/Assistant are percentages; the two package commissions are fixed VND amounts (migration v055, payroll.py). */
export function CommissionCard({ employee, onEdit }: Props) {
  const e = employee;
  const rows = [
    ...((e.custom_lead_commission_pct ?? 0) > 0 ? [{ label: "Lead commission", value: pct(e.custom_lead_commission_pct) }] : []),
    ...((e.custom_support_commission_pct ?? 0) > 0 ? [{ label: "Support commission", value: pct(e.custom_support_commission_pct) }] : []),
    ...((e.custom_assistant_commission_pct ?? 0) > 0 ? [{ label: "Assistant commission", value: pct(e.custom_assistant_commission_pct) }] : []),
    ...((e.custom_full_package_commission_pct ?? 0) > 0 ? [{ label: "Full package sales", value: formatVND(e.custom_full_package_commission_pct) }] : []),
    ...((e.custom_partial_package_commission_pct ?? 0) > 0 ? [{ label: "Partial package sales", value: formatVND(e.custom_partial_package_commission_pct) }] : []),
  ];
  return (
    <SectionCard title="Commission structure" action={<EditIconButton label="Edit commission structure" onClick={() => onEdit("commission")} />}>
      {rows.length > 0 ? <FactList rows={rows} /> : <p className="text-sm text-muted-foreground">No commissions set</p>}
    </SectionCard>
  );
}

function Amount({ value }: { value: number | undefined }) {
  return (value ?? 0) > 0 ? <>{formatVND(value)}</> : <span className="text-muted-foreground">—</span>;
}

export function AllowanceCard({ employee, onEdit }: Props) {
  const e = employee;
  return (
    <SectionCard title="Allowance rates" action={<EditIconButton label="Edit allowance rates" onClick={() => onEdit("allowance")} />}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-normal text-muted-foreground"><span className="sr-only">Package</span></th>
            <th className="pb-2 pr-3 text-right font-medium">HCM</th>
            <th className="pb-2 text-right font-medium">Destination</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-t">
            <td className="py-2 text-muted-foreground">Full package</td>
            <td className="py-2 pr-3 text-right font-medium"><Amount value={e.custom_allowance_hcm_full} /></td>
            <td className="py-2 text-right font-medium"><Amount value={e.custom_allowance_dest_full} /></td>
          </tr>
          <tr className="border-t">
            <td className="py-2 text-muted-foreground">Partial</td>
            <td className="py-2 pr-3 text-right font-medium"><Amount value={e.custom_allowance_hcm_partial} /></td>
            <td className="py-2 text-right font-medium"><Amount value={e.custom_allowance_dest_partial} /></td>
          </tr>
        </tbody>
      </table>
    </SectionCard>
  );
}
