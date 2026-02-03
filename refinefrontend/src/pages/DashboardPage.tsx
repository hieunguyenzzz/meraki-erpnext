import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useList, useGetIdentity } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays } from "lucide-react";
import { formatDate } from "@/lib/format";
import { formatTimeShort, interviewStatusVariant } from "@/lib/interview-scheduling";

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

  // --- Upcoming Interviews for current user ---
  const todayStr = new Date().toISOString().slice(0, 10);
  const email = identity?.email;

  const { result: interviewsResult, query: interviewsQuery } = useList({
    resource: "Interview",
    pagination: { mode: "off" },
    filters: [
      { field: "scheduled_on", operator: "gte", value: todayStr },
      { field: "status", operator: "in", value: ["Pending", "Under Review"] },
    ],
    meta: {
      fields: [
        "name", "job_applicant", "job_opening", "scheduled_on",
        "from_time", "to_time", "status",
      ],
    },
  });
  const allUpcoming = interviewsResult?.data ?? [];

  // Fetch interviewer from child table (not available in list API)
  const [interviewerMap, setInterviewerMap] = useState<Record<string, string>>({});
  const [detailsLoading, setDetailsLoading] = useState(true);

  useEffect(() => {
    if (interviewsQuery?.isLoading) return;
    if (allUpcoming.length === 0) {
      setDetailsLoading(false);
      return;
    }
    let cancelled = false;
    const fetchDetails = async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        allUpcoming.map(async (iv: any) => {
          try {
            const res = await fetch(
              `/api/resource/Interview/${encodeURIComponent(iv.name)}`,
              { credentials: "include" },
            );
            const data = await res.json();
            const details = data?.data?.interview_details ?? [];
            if (details.length > 0) map[iv.name] = details[0].interviewer;
          } catch { /* skip */ }
        }),
      );
      if (!cancelled) {
        setInterviewerMap(map);
        setDetailsLoading(false);
      }
    };
    fetchDetails();
    return () => { cancelled = true; };
  }, [allUpcoming, interviewsQuery?.isLoading]);

  // Filter to only this user's interviews
  const myUpcoming = useMemo(() => {
    if (!email) return [];
    return allUpcoming
      .filter((iv: any) => interviewerMap[iv.name] === email)
      .sort((a: any, b: any) =>
        a.scheduled_on === b.scheduled_on
          ? (a.from_time ?? "").localeCompare(b.from_time ?? "")
          : a.scheduled_on.localeCompare(b.scheduled_on),
      );
  }, [allUpcoming, interviewerMap, email]);

  // Resolve candidate and position names
  const { result: applicantsResult } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    meta: { fields: ["name", "applicant_name", "job_title"] },
    queryOptions: { enabled: myUpcoming.length > 0 },
  });
  const applicants = applicantsResult?.data ?? [];

  const { result: jobOpeningsResult } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
    queryOptions: { enabled: myUpcoming.length > 0 },
  });
  const jobOpenings = jobOpeningsResult?.data ?? [];

  const interviewsLoading = interviewsQuery?.isLoading || detailsLoading;
  const showInterviewsCard = interviewsLoading || myUpcoming.length > 0;

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

      {/* My Upcoming Interviews */}
      {showInterviewsCard && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              My Upcoming Interviews
            </CardTitle>
            <Link
              to="/hr/recruiting/interviews"
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {interviewsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="divide-y">
                {myUpcoming.map((iv: any) => {
                  const applicant = applicants.find((a: any) => a.name === iv.job_applicant);
                  const opening = iv.job_opening
                    ? jobOpenings.find((jo: any) => jo.name === iv.job_opening)
                    : applicant?.job_title
                      ? jobOpenings.find((jo: any) => jo.name === applicant.job_title)
                      : null;
                  return (
                    <div key={iv.name} className="flex items-center justify-between py-2 gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {applicant?.applicant_name ?? iv.job_applicant}
                        </p>
                        {opening?.job_title && (
                          <p className="text-xs text-muted-foreground truncate">
                            {opening.job_title}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-right">
                        <div>
                          <p className="text-sm">{formatDate(iv.scheduled_on)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimeShort(iv.from_time)}-{formatTimeShort(iv.to_time)}
                          </p>
                        </div>
                        <Badge variant={interviewStatusVariant(iv.status)}>
                          {iv.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
