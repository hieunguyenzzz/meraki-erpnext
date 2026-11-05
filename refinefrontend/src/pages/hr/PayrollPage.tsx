import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { useQueryState, parseAsString } from "nuqs";
import { RotateCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatePanel } from "@/components/StatePanel";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ConfirmActionDialog } from "./payroll/ConfirmActionDialog";
import { CommissionBreakdown } from "./payroll/CommissionBreakdown";
import { PayrollActions } from "./payroll/PayrollActions";
import { PayrollCards } from "./payroll/PayrollCards";
import { PayrollSummary } from "./payroll/PayrollSummary";
import { PayrollTable } from "./payroll/PayrollTable";
import { currentMonthStart, lastDayOfMonth, monthLabel, monthParser, recentMonthStarts } from "./payroll/month";
import { commissionOf, slipName, type CommissionRow } from "./payroll/types";
import { usePayrollActions } from "./payroll/usePayrollActions";
import { usePayrollEntries } from "./payroll/usePayrollEntries";
import { usePayrollSlips } from "./payroll/usePayrollSlips";

/** Parks a sticky bar on top of the 84px bottom nav: <main> pads its bottom by 104px and sticky measures from the content edge (see AppShell). */
const BOTTOM_NAV_STICKY = "-bottom-5";

type ConfirmKind = "generate" | "submit";
interface Confirm { kind: ConfirmKind; title: string; text: string; confirmLabel: string }

export default function PayrollPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Month and search live in the URL so Back restores them; a bad ?month= falls back to the current month.
  const [urlMonth, setUrlMonth] = useQueryState("month", monthParser.withDefault(currentMonthStart()).withOptions({ clearOnDefault: true }));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault("").withOptions({ clearOnDefault: true }));
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false); // closed separately so the text stays while the dialog fades out
  const openConfirm = (c: Confirm) => { setConfirm(c); setConfirmOpen(true); };

  const { entries, loaded: entriesLoaded } = usePayrollEntries();
  const monthOptions = useMemo(() => {
    const all = new Set(recentMonthStarts());
    for (const e of entries) all.add(e.start_date);
    return [...all].sort((a, b) => b.localeCompare(a));
  }, [entries]);

  // A month from the URL is only trusted once the entries are known; unknown months fall back to the current one.
  const month = !entriesLoaded || monthOptions.includes(urlMonth) ? urlMonth : currentMonthStart();
  const selectedPE = useMemo(() => entries.find((e) => e.start_date === month) ?? null, [entries, month]);
  const { slips, loading, loadError, refresh } = usePayrollSlips(selectedPE);
  const monthEnd = selectedPE ? selectedPE.end_date : lastDayOfMonth(month);
  const act = usePayrollActions({ month, monthEnd, selectedPE, refresh });

  const { result: empResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
  });
  const activeCount = empResult?.data?.length ?? 0;

  // Hide slips with zero gross pay (test accounts / placeholder employees)
  const salarySlips = useMemo(() => slips.filter((s) => s.gross_pay > 0), [slips]);
  const hasDraftSlips = slips.some((s) => s.docstatus === 0);
  const allSlipsSubmitted = !!selectedPE && salarySlips.length > 0 && salarySlips.every((s) => s.docstatus === 1);

  // Wedding allowance per employee, summed from the slips' earnings
  const weddingAllowanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const slip of slips) {
      for (const e of slip.earnings) {
        if (e.salary_component === "Wedding Allowance" && e.amount > 0) map[slip.employee] = (map[slip.employee] ?? 0) + e.amount;
      }
    }
    return map;
  }, [slips]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? salarySlips.filter((s) => `${s.employee_name} ${slipName(s)}`.toLowerCase().includes(q)) : salarySlips;
  }, [salarySlips, search]);

  const commissionRows = useMemo(() => salarySlips.map(commissionOf).filter((r): r is CommissionRow => r !== null), [salarySlips]);

  const label = monthLabel(month);
  // The wording is fixed when the dialog opens, so it doesn't flip from Generate to Recalculate mid-run.
  const generateCopy = (): Confirm => selectedPE
    ? { kind: "generate", title: `Recalculate payroll for ${label}?`, text: "This re-runs the payroll calculation for the draft salary slips of this month.", confirmLabel: "Recalculate" }
    : { kind: "generate", title: `Generate payroll for ${label}?`, text: `This creates the payroll entry and salary slips for ${activeCount} active employees.`, confirmLabel: "Generate" };

  const ready = entriesLoaded && !loading;
  const actionProps = {
    hasEntry: !!selectedPE,
    canGenerate: ready && !allSlipsSubmitted,
    canSubmit: !!selectedPE && hasDraftSlips,
    canExport: !!selectedPE && ready,
    isRunning: act.isRunning,
    submitting: act.submitting,
    exporting: act.exporting,
    bonusSaving: act.bonusSaving,
    onGenerate: () => openConfirm(generateCopy()),
    onSubmit: () => openConfirm({ kind: "submit", title: `Submit all salary slips for ${label}?`, text: "Submitted slips are locked: bonus and figures can no longer be changed.", confirmLabel: "Submit All" }),
    onExport: () => void act.exportPdf(),
  };

  async function onConfirm() {
    if (confirm?.kind === "submit") await act.submitAll();
    else await act.generate();
    setConfirmOpen(false);
  }

  let body;
  if (!entriesLoaded || loading) {
    body = <StaffSkeleton />;
  } else if (!selectedPE) {
    body = (
      <StatePanel
        kind="empty"
        title={`No payroll for ${label}`}
        text={`Generate it to create salary slips for ${activeCount} active employees.`}
      />
    );
  } else if (loadError && slips.length === 0) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load salary slips"
        text={loadError}
        action={{ label: "Try again", onClick: refresh, icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (shown.length === 0) {
    body = <StatePanel kind="empty" title={search.trim() ? "No employees match" : "No salary slips"} text={search.trim() ? "Try a different name." : "This payroll entry has no slips with pay."} />;
  } else if (isDesktop) {
    body = <PayrollTable slips={shown} weddingAllowanceMap={weddingAllowanceMap} onSetBonus={act.setBonus} />;
  } else {
    body = <PayrollCards slips={shown} weddingAllowanceMap={weddingAllowanceMap} onSetBonus={act.setBonus} />;
  }

  const showStatus = ready && !!selectedPE && (allSlipsSubmitted || hasDraftSlips);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Payroll</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground max-md:w-full">
          <span>Month</span>
          <Select value={month} onValueChange={(v) => void setUrlMonth(v)}>
            <SelectTrigger aria-label="Month" className="min-w-[160px] max-w-full font-semibold text-foreground max-md:h-12 max-md:flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        {isDesktop && <PayrollActions {...actionProps} />}
      </header>

      {act.error && (
        <div role="alert" className="flex items-center justify-between rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <span>{act.error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => act.setError(null)} className="ml-4 flex h-8 w-8 items-center justify-center font-medium max-md:h-12 max-md:w-12">&times;</button>
        </div>
      )}
      {loadError && slips.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Couldn't refresh. Showing the last loaded slips.{" "}
          <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={refresh}>Try again</button>
        </p>
      )}

      {showStatus && selectedPE && (
        <div className={`flex flex-wrap items-center gap-3 rounded-card px-4 py-3.5 ${allSlipsSubmitted ? "bg-success-soft text-success-soft-foreground" : "bg-warning-soft text-warning-soft-foreground"}`}>
          <Badge variant={allSlipsSubmitted ? "success" : "warning"} className="bg-card">
            {allSlipsSubmitted ? "Submitted" : "Draft · awaiting submission"}
          </Badge>
          <span className="text-sm">{salarySlips.length} employees · {selectedPE.start_date} to {selectedPE.end_date}</span>
        </div>
      )}

      {ready && selectedPE && salarySlips.length > 0 && <PayrollSummary slips={salarySlips} />}

      {ready && selectedPE && salarySlips.length > 0 && (
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search by employee"
            placeholder="Search by employee..."
            value={search}
            onChange={(e) => void setSearch(e.target.value)}
            className="rounded-full pl-10 max-md:h-12 max-md:pl-10"
          />
        </div>
      )}

      {body}

      {isDesktop && ready && <CommissionBreakdown rows={commissionRows} />}

      {/* Phone action bar, parked above the bottom nav (see BOTTOM_NAV_STICKY). */}
      {!isDesktop && entriesLoaded && (
        <div className={`sticky ${BOTTOM_NAV_STICKY} z-20 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur`}>
          <PayrollActions {...actionProps} mobile />
        </div>
      )}

      <ConfirmActionDialog
        open={confirmOpen}
        title={confirm?.title ?? ""}
        text={confirm?.text ?? ""}
        confirmLabel={confirm?.confirmLabel ?? ""}
        busy={act.isRunning || act.submitting}
        onConfirm={() => void onConfirm()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
