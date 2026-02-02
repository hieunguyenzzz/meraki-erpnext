import { useList, useGetIdentity } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const firstName = identity?.name?.split(" ")[0] ?? identity?.email?.split("@")[0] ?? "";

  const { result: leadsResult, query: leadsQuery } = useList({
    resource: "Lead",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "nin" as const, value: ["Converted", "Do Not Contact"] }],
    meta: { fields: ["name"] },
  });

  const { result: employeesResult, query: employeesQuery } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name"] },
  });

  const activeLeadCount = leadsResult?.data?.length ?? 0;
  const activeEmployeeCount = employeesResult?.data?.length ?? 0;
  const isLoading = leadsQuery?.isLoading || employeesQuery?.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {firstName ? `Welcome, ${firstName}` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground">Here's an overview of your business</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[60px]" />
            ) : (
              <div className="text-2xl font-bold">{activeLeadCount}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-[60px]" />
            ) : (
              <div className="text-2xl font-bold">{activeEmployeeCount}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
