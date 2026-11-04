import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useList } from "@refinedev/core";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/hr/recruiting/pipeline", label: "Pipeline", resource: null },
  { to: "/hr/recruiting/all", label: "All applicants", resource: "Job Applicant" },
  { to: "/hr/recruiting/jobs", label: "Job openings", resource: "Job Opening" },
] as const;

/** Total records of a doctype for the tab labels; the data provider counts server-side. */
function useTotal(resource: string) {
  const { result } = useList({ resource, pagination: { currentPage: 1, pageSize: 1 }, meta: { fields: ["name"] } });
  return result?.total;
}

/** Page title, optional action, and the three recruiting views as tabs (D-Recruiting.dc.html). */
export function RecruitingHeader({ action }: { action?: ReactNode }) {
  const totals: Record<string, number | undefined> = {
    "Job Applicant": useTotal("Job Applicant"),
    "Job Opening": useTotal("Job Opening"),
  };
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Recruiting</h1>
        {action}
      </header>
      <nav aria-label="Recruiting views" className="scrollbar-hide -mx-4 flex gap-6 overflow-x-auto border-b px-4 md:mx-0 md:gap-7 md:px-0">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                "-mb-px flex h-12 shrink-0 items-center whitespace-nowrap border-b-2 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-11",
                isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {t.label}
            {t.resource && totals[t.resource] !== undefined && <span className="max-md:hidden">&nbsp;· {totals[t.resource]}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
