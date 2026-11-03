import { useMemo } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { RotateCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { WFH_TABS } from "./wfh/types";
import { useWfhRequests } from "./wfh/useWfhRequests";
import { WfhCard, WfhTableRow } from "./wfh/WfhRows";

export default function WfhPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { requests, loading, loadError, refreshFailed, retry, outcomes, errors, processing, decide } = useWfhRequests();

  // Tab and search live in the URL so Back restores them; junk values fall back to the defaults.
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(WFH_TABS).withDefault("pending").withOptions({ clearOnDefault: true }));
  const [search, setSearch] = useQueryState("q", { defaultValue: "", clearOnDefault: true });

  const pendingCount = useMemo(() => requests.filter((r) => r.docstatus === 0 && !outcomes[r.name]).length, [requests, outcomes]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests
      .filter((r) => tab === "all" || r.docstatus === 0)
      .filter((r) => !q || (r.employee_name || r.employee).toLowerCase().includes(q));
  }, [requests, tab, search]);

  const rowProps = (name: string) => ({
    outcome: outcomes[name],
    processing: processing.has(name),
    error: errors[name],
    onDecide: (n: string, a: "approve" | "reject") => void decide(n, a),
  });

  let body;
  if (loadError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load WFH requests"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: retry, icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (loading) {
    body = <StaffSkeleton />;
  } else if (rows.length === 0) {
    const filtered = search.trim() !== "";
    body = (
      <StatePanel
        kind="empty"
        title={filtered ? "No requests match" : tab === "pending" ? "Nothing waiting for you" : "No WFH requests yet"}
        text={filtered ? "Try a different name." : tab === "pending" ? "New requests also arrive in Notifications." : "Requests appear here once staff apply."}
      />
    );
  } else if (isDesktop) {
    body = (
      <section className="overflow-hidden rounded-card border bg-card">
        <div className="overflow-x-auto">
          <table aria-label="Work from home requests" className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted text-[13px] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold">Employee</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">Dates</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Days</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">Reason</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <WfhTableRow key={r.name} request={r} {...rowProps(r.name)} />)}
            </tbody>
          </table>
        </div>
      </section>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {rows.map((r) => <WfhCard key={r.name} request={r} {...rowProps(r.name)} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Work from home</h1>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={(v) => void setTab(v as (typeof WFH_TABS)[number])}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="pending" className="max-md:h-12 max-md:flex-1">
              Pending{!loading && !loadError ? ` (${pendingCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="all" className="max-md:h-12 max-md:flex-1">
              All{!loading && !loadError ? ` (${requests.length})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search by employee"
            placeholder="Search employee"
            value={search}
            onChange={(e) => void setSearch(e.target.value)}
            className="rounded-full pl-10 max-md:h-12 max-md:pl-10"
          />
        </div>
      </div>

      {refreshFailed && (
        <p role="status" className="text-sm text-muted-foreground">
          Couldn't refresh. Showing the last loaded list.{" "}
          <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={retry}>Try again</button>
        </p>
      )}

      {body}
    </div>
  );
}
