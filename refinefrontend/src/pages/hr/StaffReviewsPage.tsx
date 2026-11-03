import { useState, useMemo, useEffect } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { useQueryState } from "nuqs";
import { Plus, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateReviewSheet } from "@/components/staff-review/CreateReviewSheet";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ReviewCard, ReviewTableRow } from "./staff-reviews/ReviewRows";
import type { MerakiReview } from "./staff-reviews/reviewUtils";

const ALL = "__all__";

export default function StaffReviewsPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const invalidate = useInvalidate();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filters live in the URL so Back restores them; an unknown period falls back to "all".
  const [search, setSearch] = useQueryState("q", { defaultValue: "", clearOnDefault: true });
  const [periodParam, setPeriod] = useQueryState("period", { defaultValue: "", clearOnDefault: true });

  const { result, query } = useList<MerakiReview>({
    resource: "Meraki Review",
    pagination: { pageSize: 50 },
    sorters: [{ field: "review_date", order: "desc" }],
    meta: {
      fields: ["name", "employee", "employee_name", "review_date", "period", "average_rating", "overall_score", "reviewer", "creation"],
    },
  });

  const reviews = useMemo(() => (result?.data ?? []) as MerakiReview[], [result]);
  const periods = useMemo(() => [...new Set(reviews.map((r) => r.period).filter((p): p is string => !!p))].sort(), [reviews]);
  const period = periods.includes(periodParam) ? periodParam : "";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews
      .filter((r) => !period || r.period === period)
      .filter((r) => !q || (r.employee_name || r.employee).toLowerCase().includes(q));
  }, [reviews, search, period]);

  const loadError = query.isError && reviews.length === 0;
  const filtered = search.trim() !== "" || period !== "";

  useEffect(() => {
    if (query.isError) console.error("Staff reviews list failed to load", query.error);
  }, [query.isError, query.error]);

  let body;
  if (loadError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load reviews"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (query.isLoading) {
    body = <StaffSkeleton />;
  } else if (rows.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={filtered ? "No reviews match" : "No reviews yet"}
        text={filtered ? "Try a different name or period." : "Start a review to record how a team member is doing."}
      />
    );
  } else if (isDesktop) {
    body = (
      <section className="overflow-hidden rounded-card border bg-card">
        <div className="overflow-x-auto">
          <table aria-label="Staff reviews" className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-muted text-[13px] text-muted-foreground">
              <tr>
                {["Employee", "Date", "Period", "Score", "Reviewer", "Created"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map((r) => <ReviewTableRow key={r.name} review={r} />)}</tbody>
          </table>
        </div>
      </section>
    );
  } else {
    body = <div className="flex flex-col gap-3">{rows.map((r) => <ReviewCard key={r.name} review={r} />)}</div>;
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Staff reviews</h1>
        <Button onClick={() => setSheetOpen(true)} className="max-md:h-12">
          <Plus className="mr-1 h-4 w-4" /> New review
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
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
        <Select value={period || ALL} onValueChange={(v) => void setPeriod(v === ALL ? "" : v)}>
          <SelectTrigger aria-label="Filter by period" className="rounded-full max-md:h-12 md:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All periods</SelectItem>
            {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {body}

      <CreateReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={() => {
          setSheetOpen(false);
          invalidate({ resource: "Meraki Review", invalidates: ["list"] });
        }}
      />
    </div>
  );
}
