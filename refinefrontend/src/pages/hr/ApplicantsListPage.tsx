import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Link } from "react-router";
import { Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecruitingHeader } from "@/components/recruiting/RecruitingHeader";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { extractErrorMessage } from "@/lib/errors";
import { ratingToStars } from "@/lib/recruiting-kanban";
import { ApplicantCards } from "./applicants-list/ApplicantCards";
import { ApplicantFilters, type FilterValues } from "./applicants-list/ApplicantFilters";
import { ApplicantsTable } from "./applicants-list/ApplicantsTable";
import { SelectionBar } from "./applicants-list/SelectionBar";
import {
  FINISHED_STAGES, RATINGS, SORT_KEYS, STAGES, compareRows, stageOf,
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
  const [cityParam, setCity] = useQueryState("city", { defaultValue: "", clearOnDefault: true });
  const [sortParam, setSortParam] = useQueryState("sort", parseAsStringLiteral(SORT_KEYS).withDefault("creation").withOptions(opts));
  const [dirParam, setDirParam] = useQueryState("dir", parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc").withOptions(opts));
  const sort: Sort = useMemo(() => ({ key: sortParam, dir: dirParam === "desc" ? -1 : 1 }), [sortParam, dirParam]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const sendingRef = useRef(false);
  const [page, setPage] = useState(0);

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
  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const a of (result?.data ?? []) as RawApplicant[]) if (a.custom_city) set.add(a.custom_city);
    return [...set].sort((x, y) => x.localeCompare(y)).map((c) => ({ label: c, value: c }));
  }, [result]);
  const positions = useMemo(() => jobOpenings.map((jo) => ({ label: jo.job_title, value: jo.name })), [jobOpenings]);
  const sourceOptions = useMemo(() => sources.map((s) => ({ label: s.name, value: s.name })), [sources]);

  // A source/position in the URL that matches nothing loaded is ignored
  const source = sourceParam && sources.some((s) => s.name === sourceParam) ? sourceParam : "";
  const position = positionParam && jobOpenings.some((jo) => jo.name === positionParam) ? positionParam : "";
  const city = cityParam && cities.some((c) => c.value === cityParam) ? cityParam : "";
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

  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const s = deferredSearch.trim().toLowerCase();
    return applicants
      // No stage chosen means "All active": finished stages are hidden until picked
      .filter((a) => (stage ? stageOf(a) === stage : !FINISHED_STAGES.includes(stageOf(a))))
      .filter((a) => !rating || ratingToStars(a.applicant_rating) >= Number(rating))
      .filter((a) => !source || a.source === source)
      .filter((a) => !position || a.jobName === position)
      .filter((a) => !city || a.custom_city === city)
      .filter((a) => !s || [a.applicant_name || a.name, a.email_id, a.phone_number].some((v) => (v ?? "").toLowerCase().includes(s)));
  }, [applicants, deferredSearch, stage, rating, source, position, city]);

  const rows = useMemo(() => [...filtered].sort((a, b) => compareRows(a, b, sort.key) * sort.dir), [filtered, sort]);

  // Reset paging when the filters or sort change; a changed filter also drops the selection
  useEffect(() => setPage(0), [search, stage, rating, source, position, city, sort]);
  useEffect(() => { setSelected(new Set()); setSendError(""); }, [search, stage, rating, source, position, city]);

  // Desktop pages through the list; phones keep growing it with "Show more"
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const pageNo = Math.min(page, lastPage);
  const shown = useMemo(
    () => (isDesktop ? rows.slice(pageNo * PAGE_SIZE, (pageNo + 1) * PAGE_SIZE) : rows.slice(0, (pageNo + 1) * PAGE_SIZE)),
    [rows, pageNo, isDesktop],
  );
  // Only applicants still in the filtered list count; paging on desktop clears the selection, so nothing off-screen is sent
  const selectedIds = useMemo(() => rows.filter((r) => selected.has(r.name)).map((r) => r.name), [rows, selected]);

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
        title={applicants.length === 0 ? "No applicants yet" : "No applicants match"}
        text={applicants.length === 0 ? "Applicants appear here once someone applies." : "Try a different search or stage. Hired and rejected applicants only show when you pick that stage."}
      />
    );
  } else {
    body = (
      <>
        <span className="px-1 text-[13px] text-muted-foreground md:hidden">
          {rows.length} applicant{rows.length === 1 ? "" : "s"}
        </span>
        {isDesktop
          ? <ApplicantsTable rows={shown} sort={sort} onSort={toggleSort} selected={selected} onToggle={toggle} onToggleAll={toggleAll} page={pageNo} pageSize={PAGE_SIZE} total={rows.length} onPage={(p) => { setPage(p); setSelected(new Set()); setSendError(""); }} />
          : <ApplicantCards rows={shown} selected={selected} onToggle={toggle} />}
        {!isDesktop && rows.length > shown.length && (
          <Button variant="outline" className="self-center" onClick={() => setPage(pageNo + 1)}>
            Show more ({rows.length - shown.length})
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-[18px]">
      <RecruitingHeader
        action={
          <Button asChild className="shrink-0 max-md:hidden">
            <Link to="/hr/recruiting/jobs"><Plus aria-hidden />Job opening</Link>
          </Button>
        }
      />
      <ApplicantFilters
        values={filterValues} onChange={changeFilter} onClear={clearFilters} sources={sourceOptions} positions={positions} cities={cities}
        countLabel={`${rows.length} ${stage ? "" : "active "}shown`}
      />
      {body}
      {/* Keeps the last cards and "Show more" clear of the floating bar */}
      {selectedIds.length > 0 && <div aria-hidden className="h-[140px] shrink-0" />}
      {selectedIds.length > 0 && (
        <SelectionBar count={selectedIds.length} sending={sending} error={sendError} onSend={() => void handleSendToScanner()} onClear={() => { setSelected(new Set()); setSendError(""); }} />
      )}
    </div>
  );
}
