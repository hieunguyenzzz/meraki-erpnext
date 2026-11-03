import { useGetIdentity, useList, usePermissions } from "@refinedev/core";
import { HomeGreeting } from "@/components/dashboard/HomeGreeting";
import { InterviewsCard } from "@/components/dashboard/InterviewsCard";
import { MyTasksList } from "@/components/dashboard/MyTasksList";
import MyPayrollCard from "@/components/dashboard/MyPayrollCard";
import { NextWeddingCard } from "@/components/dashboard/NextWeddingCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { UpcomingWeddings } from "@/components/dashboard/UpcomingWeddings";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { useMyLeaveDays } from "@/hooks/useMyLeaveDays";
import { useMyTasks } from "@/hooks/useMyTasks";
import { useMyWeddings } from "@/hooks/useMyWeddings";
import { CRM_ROLES, HR_ROLES, PLANNER_ROLES, hasModuleAccess } from "@/lib/roles";

/** Personal home for planners, sales and HR (employee-only staff get StaffHome). */
export default function PersonalHome() {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const { data: roles } = usePermissions<string[]>({});
  const email = identity?.email;
  const firstName = identity?.name?.split(" ")[0] ?? email?.split("@")[0] ?? "";
  const { employeeId } = useMyEmployee();

  const hasCrm = hasModuleAccess(roles ?? [], CRM_ROLES);
  const hasHr = hasModuleAccess(roles ?? [], HR_ROLES);
  const hasPlanner = hasModuleAccess(roles ?? [], PLANNER_ROLES);

  const { weddings, isLoading: weddingsLoading, isError: weddingsError } = useMyWeddings(hasPlanner && !!employeeId);
  const upcoming = weddings.filter((w) => w.days_to_go != null && w.days_to_go >= 0);

  const { tasks, isLoading: tasksLoading } = useMyTasks(email, employeeId);
  const { days: leaveDays, failed: leaveFailed } = useMyLeaveDays(hasPlanner ? employeeId : null);

  const { result: leads, query: leadsQuery } = useList({
    resource: "Lead",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "nin", value: ["Converted", "Do Not Contact"] }],
    meta: { fields: ["name"] },
    queryOptions: { enabled: hasCrm },
  });
  const { result: staff, query: staffQuery } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
    queryOptions: { enabled: hasHr },
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-6 md:space-y-6 md:pb-0">
      <HomeGreeting firstName={firstName} />

      <div className="grid gap-5 md:grid-cols-2 md:gap-6">
        <div className="min-w-0 space-y-5 md:space-y-6">
          {hasPlanner && (
            <>
              <NextWeddingCard wedding={upcoming[0]} isLoading={weddingsLoading} isError={weddingsError} basePath="/projects" />
              <UpcomingWeddings weddings={upcoming.slice(1, 6)} basePath="/projects" />
            </>
          )}
          <InterviewsCard email={hasHr ? email : undefined} />
        </div>
        <div className="min-w-0 space-y-5 md:space-y-6">
          <MyTasksList tasks={tasks} isLoading={tasksLoading} />
          <section aria-label="Quick stats" className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2.5">
            {hasPlanner && (
              <StatTile
                label="Leave left"
                to="/my-leaves"
                value={leaveDays === null ? null : `${leaveDays} d`}
                error={leaveFailed}
              />
            )}
            {hasCrm && (
              <StatTile label="Open leads" to="/crm" value={leadsQuery?.isLoading ? null : String(leads?.data?.length ?? 0)} />
            )}
            {hasHr && (
              <StatTile label="Active staff" to="/hr/employees" value={staffQuery?.isLoading ? null : String(staff?.data?.length ?? 0)} />
            )}
            <MyPayrollCard />
          </section>
        </div>
      </div>
    </div>
  );
}
