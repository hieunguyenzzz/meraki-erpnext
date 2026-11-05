import { useEffect, useMemo, useRef, useState } from "react";
import { useCustom, useInvalidate, useList, useUpdate } from "@refinedev/core";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Plus, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecruitingHeader } from "@/components/recruiting/RecruitingHeader";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { JobCards } from "./job-openings/JobCards";
import { JobPanel } from "./job-openings/JobPanel";
import { JobSheet } from "./job-openings/JobSheet";
import { JobsTable } from "./job-openings/JobsTable";
import { SORT_KEYS, statusOf, type JobOpening, type Sort, type SortKey } from "./job-openings/types";

const opts = { clearOnDefault: true } as const;

export default function JobOpeningsPage() {
  const invalidate = useInvalidate();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { mutateAsync: updateJob } = useUpdate();

  const [search, setSearch] = useQueryState("q", { defaultValue: "", clearOnDefault: true });
  const [sortParam, setSortParam] = useQueryState("sort", parseAsStringLiteral(SORT_KEYS).withOptions(opts));
  const [dirParam, setDirParam] = useQueryState("dir", parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc").withOptions(opts));
  // No sort in the URL keeps the list in newest-first order, as the server returns it
  const sort: Sort | null = useMemo(() => (sortParam ? { key: sortParam, dir: dirParam === "desc" ? -1 : 1 } : null), [sortParam, dirParam]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobOpening | null>(null);
  const [actionError, setActionError] = useState("");
  const pendingToggles = useRef(new Set<string>());

  const { result, query } = useList<JobOpening>({
    resource: "Job Opening",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: { fields: ["name", "job_title", "status", "location", "closes_on", "designation", "description"] },
  });
  useEffect(() => {
    if (query.isError) console.error("Job openings list failed", query.error);
  }, [query.isError, query.error]);

  // Applicants per opening, for the table's Applicants column
  // One grouped count in the database (frappe.client.get_list group_by); phones don't show the column.
  // dataProvider.custom ignores `config.query`, so the params go in the URL itself.
  const countParams = new URLSearchParams({
    doctype: "Job Applicant",
    fields: JSON.stringify(["job_title", "count(name) as applicant_count"]),
    group_by: "job_title",
    limit_page_length: "0",
  });
  const { result: countsResult } = useCustom({
    url: `/api/method/frappe.client.get_list?${countParams}`,
    method: "get",
    queryOptions: { enabled: isDesktop },
  });
  const countRows = (countsResult?.data as { message?: { job_title: string | null; applicant_count: number }[] } | undefined)?.message;
  const applicantCounts = useMemo(
    () => new Map((countRows ?? []).filter((r) => r.job_title).map((r) => [r.job_title as string, r.applicant_count])),
    [countRows],
  );

  const jobs = useMemo(() => (result?.data ?? []) as JobOpening[], [result]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = jobs.filter((j) => !s || (j.job_title ?? "").toLowerCase().includes(s));
    if (!sort) return list;
    const val = (j: JobOpening) => (sort.key === "status" ? statusOf(j) : j[sort.key] ?? "");
    return [...list].sort((a, b) => val(a).localeCompare(val(b)) * sort.dir);
  }, [jobs, search, sort]);

  function toggleSort(key: SortKey) {
    if (sort?.key === key) void setDirParam(sort.dir === 1 ? "desc" : "asc");
    else {
      void setSortParam(key);
      void setDirParam("asc");
    }
  }

  function openCreate() {
    setEditingJob(null);
    setSheetOpen(true);
  }

  function openEdit(job: JobOpening) {
    setEditingJob(job);
    setSheetOpen(true);
  }

  async function handleToggleStatus(row: JobOpening) {
    if (pendingToggles.current.has(row.name)) return;
    pendingToggles.current.add(row.name);
    setActionError("");
    try {
      await updateJob({ resource: "Job Opening", id: row.name, values: { status: statusOf(row) === "Open" ? "Closed" : "Open" } });
      invalidate({ resource: "Job Opening", invalidates: ["list"] });
    } catch (err) {
      console.error("Toggle job opening status failed", err);
      setActionError(`Couldn't update ${row.job_title}. Try again.`);
    } finally {
      pendingToggles.current.delete(row.name);
    }
  }

  // The edit form keeps the record it opened with; status actions use the refreshed one
  const liveJob = editingJob ? jobs.find((j) => j.name === editingJob.name) ?? editingJob : null;

  let body;
  if (query.isError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load job openings"
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
        title={search ? "No positions match" : "No job openings yet"}
        text={search ? "Try a different search." : "Add a position to start receiving applications."}
        action={search ? undefined : { label: "Create job opening", onClick: openCreate }}
      />
    );
  } else {
    body = (
      <>
        <span className="px-1 text-[13px] text-muted-foreground md:hidden">
          {rows.length} position{rows.length === 1 ? "" : "s"}
        </span>
        {isDesktop
          ? <JobsTable jobs={rows} sort={sort} onSort={toggleSort} onEdit={openEdit} onToggleStatus={(j) => void handleToggleStatus(j)} applicantCounts={applicantCounts} activeName={sheetOpen ? editingJob?.name ?? null : null} />
          : <JobCards jobs={rows} onEdit={openEdit} onToggleStatus={(j) => void handleToggleStatus(j)} />}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-[18px]">
      <RecruitingHeader
        action={
          <Button onClick={openCreate} className="shrink-0">
            <Plus aria-hidden />
            <span className="md:hidden">Job</span>
            <span className="max-md:hidden">Create job opening</span>
          </Button>
        }
      />

      <label className="relative flex md:w-72">
        <span className="sr-only">Search positions</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="text" inputMode="search" placeholder="Search positions" value={search} onChange={(e) => void setSearch(e.target.value)} className="rounded-full pl-11 max-md:pl-11" />
      </label>

      {actionError && <p role="alert" className="px-1 text-sm text-destructive">{actionError}</p>}

      {isDesktop ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">{body}</div>
          {sheetOpen && <JobPanel key={editingJob?.name ?? "new"} job={editingJob} status={liveJob ? statusOf(liveJob) : "Open"} onClose={() => setSheetOpen(false)} onToggleStatus={() => liveJob && void handleToggleStatus(liveJob)} />}
        </div>
      ) : (
        <>
          {body}
          <JobSheet open={sheetOpen} job={editingJob} onClose={() => setSheetOpen(false)} />
        </>
      )}
    </div>
  );
}
