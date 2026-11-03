import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useGetIdentity } from "@refinedev/core";
import { Heart, TreePalm } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { useMyWeddings } from "@/hooks/useMyWeddings";
import { totalAnnualLeaveDays } from "@/lib/leaveBalance";
import MyPayrollCard from "@/components/dashboard/MyPayrollCard";
import { WeddingRow } from "@/components/dashboard/WeddingRow";

/**
 * Home for Employee-only staff. Deliberately separate from DashboardPage so it only
 * calls endpoints scoped to the caller (my weddings, own leave balance, own payslips).
 */
export default function StaffHome() {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const firstName = identity?.name?.split(" ")[0] ?? identity?.email?.split("@")[0] ?? "";
  const { employeeId } = useMyEmployee();
  const { weddings, isLoading, isError } = useMyWeddings();
  const upcoming = weddings.filter((w) => w.days_to_go != null && w.days_to_go >= 0);
  const next = upcoming[0];

  const [leaveDays, setLeaveDays] = useState<number | null>(null);
  const [leaveFailed, setLeaveFailed] = useState(false);
  useEffect(() => {
    if (!employeeId) return;
    fetch(`/inquiry-api/leave/balance?employee=${employeeId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`leave/balance returned ${r.status}`);
        return r.json();
      })
      .then((json) => setLeaveDays(totalAnnualLeaveDays(json?.data)))
      .catch((err: unknown) => {
        console.error("StaffHome: leave balance failed", err);
        setLeaveFailed(true);
      });
  }, [employeeId]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{firstName ? `Welcome, ${firstName}` : "Home"}</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Heart className="h-4 w-4" /> Next wedding
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : isError ? (
            <p className="text-sm text-danger-soft-foreground">Could not load your weddings. Please try again.</p>
          ) : next ? (
            <div className="space-y-2">
              <p className="text-3xl font-bold">
                {next.days_to_go === 0 ? "Today" : `${next.days_to_go} days to go`}
              </p>
              <WeddingRow wedding={next} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming weddings assigned to you.</p>
          )}
        </CardContent>
      </Card>

      {upcoming.length > 1 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Upcoming weddings</h2>
            <Link to="/my-weddings" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {upcoming.slice(1, 4).map((w) => <WeddingRow key={w.id} wedding={w} />)}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/my-leaves" className="block">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <TreePalm className="h-4 w-4" /> Annual Leave Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaveFailed ? (
                <p className="text-sm text-danger-soft-foreground">Could not load your balance.</p>
              ) : leaveDays === null ? (
                <Skeleton className="h-8 w-[80px]" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{leaveDays}</span>
                  <span className="text-sm text-muted-foreground">days available</span>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
        <MyPayrollCard />
      </div>
    </div>
  );
}
