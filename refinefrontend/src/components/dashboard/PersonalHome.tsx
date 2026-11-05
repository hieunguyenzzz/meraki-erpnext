import type { ReactNode } from "react";
import { Link } from "react-router";
import { useGetIdentity } from "@refinedev/core";
import { HomeGreeting } from "@/components/dashboard/HomeGreeting";
import { InterviewsCard } from "@/components/dashboard/InterviewsCard";
import { MyTasksList } from "@/components/dashboard/MyTasksList";
import { NextWeddingCard } from "@/components/dashboard/NextWeddingCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { UpcomingWeddings } from "@/components/dashboard/UpcomingWeddings";
import { leaveLeftLabel, useHomePlanner } from "@/hooks/useHomePlanner";
import { formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Personal home for planners, sales and HR (employee-only staff get StaffHome). All figures come from GET /inquiry-api/home/planner. */
export default function PersonalHome({ switcher }: { switcher?: ReactNode }) {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const firstName = identity?.name?.split(" ")[0] ?? identity?.email?.split("@")[0] ?? "";
  const { data, isLoading, isError } = useHomePlanner();

  const slip = data?.latest_payslip;
  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4 pb-6 md:space-y-5 md:pb-0">
      <HomeGreeting
        firstName={firstName}
        action={
          <Link
            to="/finance/expenses/new"
            className="hidden h-10 items-center rounded-full bg-primary-fill px-4 text-sm font-semibold text-primary-fill-foreground hover:opacity-90 md:inline-flex"
          >
            + Add expense
          </Link>
        }
      />
      {switcher}

      {isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
          Could not load your Home. Please try again.
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        {(isLoading || data?.has_weddings) && (
          <div className="flex min-w-0 flex-[2_1_460px] flex-col">
            <NextWeddingCard wedding={data?.next_wedding} isLoading={isLoading} isError={false} basePath="/projects" />
          </div>
        )}
        {data && (
          <section aria-label="Quick stats" className={cn("grid min-w-0 content-start gap-2.5 md:gap-3", data.has_weddings ? "flex-[1_1_260px] grid-cols-1" : "flex-1 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]")}>
            {(data.leave !== null || data.leave_failed) && (
              <StatTile label="Leave left" to="/my-leaves" value={leaveLeftLabel(data.leave)} error={data.leave_failed} />
            )}
            {data.open_leads !== null && <StatTile label="Open leads" to="/crm" value={String(data.open_leads)} />}
            {data.active_staff !== null && <StatTile label="Active staff" to="/hr/employees" value={String(data.active_staff)} />}
            {slip && (
              <StatTile
                label={`Latest payslip · ${MONTH_SHORT[Number(slip.start_date.slice(5, 7)) - 1]}`}
                to="/my-payroll"
                value={formatVNDFull(slip.net_pay)}
              />
            )}
          </section>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col">
          <MyTasksList tasks={data?.tasks.items ?? []} openCount={data?.tasks.open_count ?? 0} isLoading={isLoading} />
        </div>
        {data && data.upcoming.length > 0 && (
          <div className="flex min-w-0 flex-[1_1_360px] flex-col">
            <UpcomingWeddings weddings={data.upcoming} basePath="/projects" />
          </div>
        )}
      </div>

      {data?.active_staff != null && <InterviewsCard email={identity?.email} />}
    </div>
  );
}
