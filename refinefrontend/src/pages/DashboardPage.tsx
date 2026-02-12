import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useList, useGetIdentity, usePermissions } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CheckSquare, Clock, FolderKanban } from "lucide-react";
import { formatDate } from "@/lib/format";
import { formatTimeShort, interviewStatusVariant } from "@/lib/interview-scheduling";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { CRM_ROLES, HR_ROLES, hasModuleAccess } from "@/lib/roles";

function priorityVariant(priority: string) {
  switch (priority) {
    case "Urgent":
    case "High":
      return "destructive" as const;
    case "Medium":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function phaseBadgeVariant(phase: string) {
  switch (phase) {
    case "Onboarding":
      return "info" as const;
    case "Planning":
      return "warning" as const;
    case "Final Details":
      return "info" as const;
    case "Wedding Week":
      return "destructive" as const;
    case "Day-of":
      return "secondary" as const;
    case "Completed":
      return "success" as const;
    default:
      return "secondary" as const;
  }
}

export default function DashboardPage() {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const { data: roles } = usePermissions<string[]>({});
  const firstName = identity?.name?.split(" ")[0] ?? identity?.email?.split("@")[0] ?? "";
  const { employee, employeeId } = useMyEmployee();

  const hasCrmAccess = hasModuleAccess(roles ?? [], CRM_ROLES);
  const hasHrAccess = hasModuleAccess(roles ?? [], HR_ROLES);

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

  // --- My Tasks ---
  const { result: allTasksResult, query: tasksQuery } = useList({
    resource: "Task",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "nin", value: ["Completed", "Cancelled"] }],
    sorters: [{ field: "exp_end_date", order: "asc" }],
    meta: {
      fields: [
        "name",
        "subject",
        "project",
        "exp_end_date",
        "status",
        "priority",
        "custom_wedding_phase",
        "_assign",
        "custom_shared_with",
        "owner",
      ],
    },
  });
  const allTasks = allTasksResult?.data ?? [];

  // Fetch projects for linking
  const { result: projectsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name"] },
    queryOptions: { enabled: allTasks.length > 0 },
  });
  const projects = projectsResult?.data ?? [];

  // Filter tasks: assigned to me, shared with me, or created by me
  const myTasks = useMemo(() => {
    if (!email) return [];
    return allTasks.filter((task: any) => {
      // Check if assigned to current user
      let isAssigned = false;
      try {
        const assignedUsers = JSON.parse(task._assign || "[]");
        isAssigned = assignedUsers.includes(email);
      } catch {
        isAssigned = false;
      }

      // Check if shared with current employee (only if employee record exists)
      let isShared = false;
      if (employeeId) {
        const sharedWith = task.custom_shared_with?.split(",").map((s: string) => s.trim()) || [];
        isShared = sharedWith.includes(employeeId);
      }

      // Check if created by current user
      const isCreator = task.owner === email;

      return isAssigned || isShared || isCreator;
    });
  }, [allTasks, email, employeeId]);

  const tasksLoading = tasksQuery?.isLoading;
  const showTasksCard = tasksLoading || myTasks.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {firstName ? `Welcome, ${firstName}` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground">Here's an overview of your business</p>
      </div>

      {(hasCrmAccess || hasHrAccess) && (
        <div className="grid gap-4 md:grid-cols-3">
          {hasCrmAccess && (
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
          )}
          {hasHrAccess && (
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
          )}
        </div>
      )}

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

      {/* My Tasks */}
      {showTasksCard && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              My Tasks
            </CardTitle>
            <Link
              to="/projects"
              className="text-xs text-primary hover:underline"
            >
              View projects
            </Link>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <div className="divide-y">
                {myTasks.slice(0, 10).map((task: any) => {
                  const project = projects.find((p: any) => p.name === task.project);
                  return (
                    <div key={task.name} className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{task.subject}</p>
                          {project && (
                            <Link
                              to={`/projects/${project.name}`}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate"
                            >
                              <FolderKanban className="h-3 w-3" />
                              {project.project_name || project.name}
                            </Link>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            {task.custom_wedding_phase && (
                              <Badge
                                variant={phaseBadgeVariant(task.custom_wedding_phase)}
                                className="text-[10px]"
                              >
                                {task.custom_wedding_phase}
                              </Badge>
                            )}
                            {task.priority && (
                              <Badge
                                variant={priorityVariant(task.priority)}
                                className="text-[10px]"
                              >
                                {task.priority}
                              </Badge>
                            )}
                          </div>
                          {task.exp_end_date && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDate(task.exp_end_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {myTasks.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{myTasks.length - 10} more tasks
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
