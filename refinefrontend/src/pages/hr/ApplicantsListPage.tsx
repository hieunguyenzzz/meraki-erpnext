import { useEffect, useMemo, useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecruitingHeader } from "@/components/recruiting/RecruitingHeader";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { extractErrorMessage } from "@/lib/errors";
import { ratingToStars } from "@/lib/recruiting-kanban";
import { ApplicantCards } from "./applicants-list/ApplicantCards";
import { ApplicantFilters, type FilterValues } from "./applicants-list/ApplicantFilters";
import { ApplicantsTable } from "./applicants-list/ApplicantsTable";
import { SelectionBar } from "./applicants-list/SelectionBar";
import {
  RATINGS, SORT_KEYS, STAGES, compareRows, stageOf,
  type ApplicantRow, type Sort, type SortKey,
} from "./applicants-list/types";

/** A Job Applicant as the API returns it: job_title is the Job Opening link name. */
type RawApplicant = Omit<ApplicantRow, "jobName">;

const PAGE_SIZE = 50;
const opts = { clearOnDefault: true } as const;

export default function ApplicantsListPage() {
  const invalidate = useInvalidate();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Filters and sort live in the URL so Back from an applicant restores them; junk values fall back to defaults.
  const [search, setSearch] = useQueryState("q", { defaultValue: "", clearOnDefault: true });
  const [stageParam, setStageParam] = useQueryState("stage", parseAsStringLiteral(STAGES));
  const [ratingParam, setRatingParam] = useQueryState("rating", parseAsStringLiteral(RATINGS));
  const [sourceParam, setSourceParam] = useQueryState("source", { defaultValue: "", clearOnDefault: true });
  const [positionParam, setPositionParam] = useQueryState("position", { defaultValue: "", clearOnDefault: true });
  const [city, setCity] = useQueryState("city", { defaultValue: "", clearOnDefault: true });
  const [sortParam, setSortParam] = useQueryState("sort", parseAsStringLiteral(SORT_KEYS).withDefault("creation").withOptions(opts));
  const [dirParam, setDirParam] = useQueryState("dir", parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc").withOptions(opts));
  const sort: Sort = useMemo(() => ({ key: sortParam, dir: dirParam === "desc" ? -1 : 1 }), [sortParam, dirParam]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const sendingRef = useRef(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Data fetching
  const { result, query } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name", "applicant_name", "email_id", "phone_number",
        "job_title", "custom_recruiting_stage", "source", "creation",
        "applicant_rating", "custom_city", "country",
      ],
    },
  });
  const { result: jobOpeningsResult, query: jobsQuery } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
  });
  const { result: sourcesResult, query: sourcesQuery } = useList({
    resource: "Job Applicant Source",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  useEffect(() => {
    if (query.isError) console.error("Applicants list failed", query.error);
    if (jobsQuery.isError) console.error("Applicants: job openings failed", jobsQuery.error);
    if (sourcesQuery.isError) console.error("Applicants: sources failed", sourcesQuery.error);
  }, [query.isError, query.error, jobsQuery.isError, jobsQuery.error, sourcesQuery.isError, sourcesQuery.error]);

  const jobOpenings = useMemo(() => (jobOpeningsResult?.data ?? []) as { name: string; job_title: string }[], [jobOpeningsResult]);
  const sources = useMemo(() => (sourcesResult?.data ?? []) as { name: string }[], [sourcesResult]);
  const positions = useMemo(() => jobOpenings.map((jo) => ({ label: jo.job_title, value: jo.name })), [jobOpenings]);
  const sourceOptions = useMemo(() => sources.map((s) => ({ label: s.name, value: s.name })), [sources]);

  // A source/position in the URL that matches nothing loaded is ignored
  const source = sourceParam && sources.some((s) => s.name === sourceParam) ? sourceParam : "";
  const position = positionParam && jobOpenings.some((jo) => jo.name === positionParam) ? positionParam : "";
  const stage = stageParam ?? "";
  const rating = ratingParam ?? "";

  // Map job_title (link) -> readable title
  const joMap = useMemo(() => new Map(jobOpenings.map((jo) => [jo.name, jo.job_title])), [jobOpenings]);

  const applicants = useMemo<ApplicantRow[]>(
    () =>
      ((result?.data ?? []) as RawApplicant[]).map((a) => ({
        ...a,
        jobName: a.job_title ?? "",
        job_title: joMap.get(a.job_title) || a.job_title || "",
        applicant_rating: a.applicant_rating ?? 0,
        custom_city: a.custom_city ?? "",
        country: a.country ?? "",
      })),
    [result, joMap],
  );

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const c = city.trim().toLowerCase();
    return applicants
      .filter((a) => !stage || stageOf(a) === stage)
      .filter((a) => !rating || ratingToStars(a.applicant_rating) >= Number(rating))
      .filter((a) => !source || a.source === source)
      .filter((a) => !position || a.jobName === position)
      .filter((a) => !c || a.custom_city.toLowerCase().includes(c))
      .filter((a) => !s || (a.applicant_name || a.name).toLowerCase().includes(s))
      .sort((a, b) => compareRows(a, b, sort.key) * sort.dir);
  }, [applicants, search, stage, rating, source, position, city, sort]);

  // Reset paging when the filters or sort change
  useEffect(() => setLimit(PAGE_SIZE), [search, stage, rating, source, position, city, sort]);

  const shown = useMemo(() => rows.slice(0, limit), [rows, limit]);
  // Only applicants still in the filtered list count, so a hidden row is never sent by accident
  const selectedIds = useMemo(() => rows.filter((r) => selected.has(r.name)).map((r) => r.name), [rows, selected]);
  const isFiltered = !!(search || stage || rating || source || position || city);

  function toggleSort(key: SortKey) {
    if (sort.key === key) void setDirParam(sort.dir === 1 ? "desc" : "asc");
    else {
      void setSortParam(key);
      void setDirParam(key === "creation" || key === "applicant_rating" ? "desc" : "asc");
    }
  }

  function toggle(name: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(name); else next.delete(name);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of shown) { if (on) next.add(r.name); else next.delete(r.name); }
      return next;
    });
  }

  const filterValues: FilterValues = { search, stage, source, position, city, rating };
  function changeFilter(key: keyof FilterValues, value: string) {
    if (key === "search") void setSearch(value);
    else if (key === "city") void setCity(value);
    else if (key === "source") void setSourceParam(value);
    else if (key === "position") void setPositionParam(value);
    else if (key === "stage") void setStageParam((STAGES as readonly string[]).includes(value) ? (value as (typeof STAGES)[number]) : null);
    else void setRatingParam((RATINGS as readonly string[]).includes(value) ? (value as (typeof RATINGS)[number]) : null);
  }
  function clearFilters() {
    void setSearch(""); void setCity(""); void setSourceParam(""); void setPositionParam(""); void setStageParam(null); void setRatingParam(null);
  }

  // Send to Scanner handler
  async function handleSendToScanner() {
    if (sendingRef.current || selectedIds.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    try {
      const resp = await fetch("/inquiry-api/applicants/batch-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_names: selectedIds, stage: "Applied" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to send to scanner");
      }
      invalidate({ resource: "Job Applicant", invalidates: ["list"] });
      setSelected(new Set());
    } catch (err) {
      const message = extractErrorMessage(err, "Failed to send to scanner");
      console.error("Send to scanner failed", err);
      setSendError(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  let body;
  if (query.isError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load applicants"
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
        title={isFiltered ? "No applicants match" : "No applicants yet"}
        text={isFiltered ? "Try a different search, stage or position." : "Applicants appear here once someone applies."}
      />
    );
  } else {
    body = (
      <>
        <span className="px-1 text-[13px] text-muted-foreground md:text-sm">
          {rows.length} applicant{rows.length === 1 ? "" : "s"}
        </span>
        {isDesktop
          ? <ApplicantsTable rows={shown} sort={sort} onSort={toggleSort} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
          : <ApplicantCards rows={shown} selected={selected} onToggle={toggle} />}
        {rows.length > shown.length && (
          <Button variant="outline" className="self-center" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Show more ({rows.length - shown.length})
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RecruitingHeader />
      <ApplicantFilters values={filterValues} onChange={changeFilter} onClear={clearFilters} sources={sourceOptions} positions={positions} />
      {body}
      {selectedIds.length > 0 && (
        <SelectionBar count={selectedIds.length} sending={sending} error={sendError} onSend={() => void handleSendToScanner()} onClear={() => { setSelected(new Set()); setSendError(""); }} />
      )}
    </div>
  );
}
