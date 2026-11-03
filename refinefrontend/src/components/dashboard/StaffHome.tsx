import { useGetIdentity } from "@refinedev/core";
import { HomeGreeting } from "@/components/dashboard/HomeGreeting";
import MyPayrollCard from "@/components/dashboard/MyPayrollCard";
import { NextWeddingCard } from "@/components/dashboard/NextWeddingCard";
import { StatTile } from "@/components/dashboard/StatTile";
import { UpcomingWeddings } from "@/components/dashboard/UpcomingWeddings";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { useMyLeaveDays } from "@/hooks/useMyLeaveDays";
import { useMyWeddings } from "@/hooks/useMyWeddings";

/**
 * Home for Employee-only staff. Deliberately separate from DashboardPage so it only
 * calls endpoints scoped to the caller (my weddings, own leave balance, own payslips).
 */
export default function StaffHome() {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const firstName = identity?.name?.split(" ")[0] ?? identity?.email?.split("@")[0] ?? "";
  const { employeeId, isLoading: profileLoading } = useMyEmployee();
  const { weddings, isLoading, isError } = useMyWeddings();
  const upcoming = weddings.filter((w) => w.days_to_go != null && w.days_to_go >= 0);
  const { display: leaveDisplay, failed: leaveFailed } = useMyLeaveDays(employeeId, profileLoading);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-6 md:space-y-6 md:pb-0">
      <HomeGreeting firstName={firstName} />
      <NextWeddingCard wedding={upcoming[0]} isLoading={isLoading} isError={isError} basePath="/my-weddings" />
      <UpcomingWeddings weddings={upcoming.slice(1, 6)} basePath="/my-weddings" />
      <section aria-label="Quick stats" className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2.5">
        <StatTile label="Leave left" to="/my-leaves" value={leaveDisplay} error={leaveFailed} />
        <MyPayrollCard />
      </section>
    </div>
  );
}
