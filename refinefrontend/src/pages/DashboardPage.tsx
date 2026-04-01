import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useList, useGetIdentity, usePermissions } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CheckSquare, Clock, FolderKanban, Heart, Wallet, TreePalm } from "lucide-react";
import { formatDate, formatVND } from "@/lib/format";
import { formatTimeShort, interviewStatusVariant } from "@/lib/interview-scheduling";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { CRM_ROLES, HR_ROLES, PLANNER_ROLES, hasModuleAccess, getDashboardOptions, type DashboardOption } from "@/lib/roles";
import DirectorSection from "@/components/dashboard/DirectorSection";
import { formatDaysUntilWedding } from "@/lib/projectKanban";

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
  const hasPlannerAccess = hasModuleAccess(roles ?? [], PLANNER_ROLES);

  const dashboardOptions = getDashboardOptions(roles ?? []);
  const [dashboardPref] = useState<DashboardOption>(() => {
    if (typeof window === "undefined") return dashboardOptions[0] ?? "personal";
    const stored = localStorage.getItem("meraki-dashboard-preference") as DashboardOption | null;
    if (stored && dashboardOptions.includes(stored)) return stored;
    return dashboardOptions[0] ?? "personal";
  });
  // Keep pref in sync if roles load after initial render
  const effectivePref = dashboardOptions.includes(dashboardPref) ? dashboardPref : (dashboardOptions[0] ?? "personal");

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
  const email = identity?.email;
  const [myUpcoming, setMyUpcoming] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(true);

  useEffect(() => {
    if (!email) { setDetailsLoading(false); return; }
    let cancelled = false;
    fetch(`/inquiry-api/dashboard/my-interviews?email=${encodeURIComponent(email)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setMyUpcoming(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [email]);

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

  const interviewsLoading = detailsLoading;
  const showInterviewsCard = hasHrAccess && (interviewsLoading || myUpcoming.length > 0);

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

  // --- My Weddings (planner dashboard) ---
  const { result: myProjectsResult, query: myProjectsQuery } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Open" }],
    meta: {
      fields: [
        "name", "project_name", "custom_project_stage", "expected_end_date",
        "sales_order", "custom_lead_planner", "custom_support_planner",
        "custom_assistant_1", "custom_assistant_2", "custom_assistant_3",
        "custom_assistant_4", "custom_assistant_5",
      ],
    },
    queryOptions: { enabled: hasPlannerAccess && !!employeeId },
  });

  const { result: mySalesOrdersResult } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    filters: [{ field: "docstatus", operator: "in", value: [0, 1] }],
    meta: { fields: ["name", "custom_venue"] },
    queryOptions: { enabled: hasPlannerAccess && !!employeeId },
  });

  const { result: mySuppliersResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    meta: { fields: ["name", "supplier_name"] },
    queryOptions: { enabled: hasPlannerAccess && !!employeeId },
  });

  const ASSIGNMENT_FIELDS = [
    "custom_lead_planner", "custom_support_planner",
    "custom_assistant_1", "custom_assistant_2", "custom_assistant_3",
    "custom_assistant_4", "custom_assistant_5",
  ] as const;

  const myWeddings = useMemo(() => {
    if (!employeeId) return [];
    const allProjects = myProjectsResult?.data ?? [];
    const salesOrders = mySalesOrdersResult?.data ?? [];
    const suppliers = mySuppliersResult?.data ?? [];

    const soByName = new Map(salesOrders.map((so: any) => [so.name, so]));
    const supplierByName = new Map(suppliers.map((s: any) => [s.name, s.supplier_name]));

    return allProjects
      .filter((p: any) => ASSIGNMENT_FIELDS.some((f) => p[f] === employeeId))
      .map((p: any) => {
        const so = p.sales_order ? soByName.get(p.sales_order) : null;
        const venueName = so?.custom_venue ? (supplierByName.get(so.custom_venue) ?? so.custom_venue) : undefined;
        return {
          id: p.name,
          project_name: p.project_name,
          stage: p.custom_project_stage || "Planning",
          expected_end_date: p.expected_end_date,
          venue_name: venueName,
        };
      })
      .sort((a: any, b: any) => (a.expected_end_date ?? "").localeCompare(b.expected_end_date ?? ""))
      .slice(0, 6);
  }, [myProjectsResult, mySalesOrdersResult, mySuppliersResult, employeeId]);

  const weddingsLoading = myProjectsQuery?.isLoading;

  // --- Leave Balance (planner dashboard) ---
  const [leaveBalanceData, setLeaveBalanceData] = useState<{ data: any[]; before_august: boolean } | null>(null);
  const [leaveBalanceLoading, setLeaveBalanceLoading] = useState(false);

  useEffect(() => {
    if (!hasPlannerAccess || !employeeId) return;
    setLeaveBalanceLoading(true);
    fetch(`/inquiry-api/leave/balance?employee=${employeeId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { setLeaveBalanceData(data); setLeaveBalanceLoading(false); })
      .catch(() => { setLeaveBalanceData(null); setLeaveBalanceLoading(false); });
  }, [hasPlannerAccess, employeeId]);

  const totalLeaveDays = useMemo(() => {
    if (!leaveBalanceData?.data) return null;
    let total = 0;
    for (const item of leaveBalanceData.data) {
      const oldAllocDays = item.old_allocation ?? 0;
      const rawOldTaken = item.old_taken ?? 0;
      const oldPending = item.old_pending ?? 0;
      const newAllocDays = item.new_allocation ?? 0;
      const newTaken = item.new_taken ?? 0;
      const newPending = item.new_pending ?? 0;
      const oldAccrued = item.old_accrued ?? oldAllocDays;
      const newAccrued = item.new_accrued ?? newAllocDays;

      const cappedOldTaken = Math.min(rawOldTaken, oldAllocDays);
      const overflow = rawOldTaken - cappedOldTaken;
      const oldBalance = Math.min(oldAccrued, oldAllocDays) - cappedOldTaken - oldPending;
      const effectiveNewTaken = newTaken + overflow;
      const newBalance = Math.min(newAccrued, newAllocDays) - effectiveNewTaken - newPending;

      total += Math.max(0, oldBalance) + Math.max(0, newBalance);
    }
    return total;
  }, [leaveBalanceData]);

  // --- Latest Salary Slip (planner dashboard) ---
  const { result: salarySlipResult, query: salarySlipQuery } = useList({
    resource: "Salary Slip",
    pagination: { pageSize: 1 },
    sorters: [{ field: "posting_date", order: "desc" }],
    filters: [
      { field: "employee", operator: "eq", value: employeeId ?? "" },
      { field: "docstatus", operator: "eq", value: 1 },
    ],
    meta: { fields: ["name", "net_pay", "posting_date"] },
    queryOptions: { enabled: hasPlannerAccess && !!employeeId },
  });
  const latestSlip = (salarySlipResult?.data ?? [])[0] as any | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {firstName ? `Welcome, ${firstName}` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground">Here's an overview of your business</p>
      </div>

      {effectivePref === "director" ? (
        <DirectorSection />
      ) : (
        <>
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

      {/* My Weddings (planner dashboard) */}
      {hasPlannerAccess && (weddingsLoading || myWeddings.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Heart className="h-4 w-4" />
              My Weddings
            </CardTitle>
            <Link to="/projects" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {weddingsLoading ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {myWeddings.map((w: any) => {
                  const countdown = w.expected_end_date ? formatDaysUntilWedding(w.expected_end_date) : null;
                  return (
                    <Link
                      key={w.id}
                      to={`/projects/${w.id}`}
                      className="block rounded-lg border p-3 hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium truncate">{w.project_name}</p>
                        <Badge variant={phaseBadgeVariant(w.stage)} className="text-[10px] shrink-0">
                          {w.stage}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {w.expected_end_date && (
                          <span>{formatDate(w.expected_end_date)}</span>
                        )}
                        {countdown && (
                          <span className={`font-medium text-${countdown.color}-600`}>
                            {countdown.text}
                          </span>
                        )}
                      </div>
                      {w.venue_name && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {w.venue_name}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats (planner dashboard) */}
      {hasPlannerAccess && (
        <div className="grid gap-4 md:grid-cols-2">
          <Link to="/my-leaves" className="block">
            <Card className="hover:bg-accent transition-colors h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TreePalm className="h-4 w-4" />
                  Leave Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaveBalanceLoading ? (
                  <Skeleton className="h-8 w-[80px]" />
                ) : totalLeaveDays !== null ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{totalLeaveDays}</span>
                    <span className="text-sm text-muted-foreground">days available</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </CardContent>
            </Card>
          </Link>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Latest Salary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salarySlipQuery?.isLoading ? (
                <Skeleton className="h-8 w-[120px]" />
              ) : latestSlip ? (
                <div>
                  <div className="text-2xl font-bold">{formatVND(latestSlip.net_pay)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(latestSlip.posting_date).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No salary slips</p>
              )}
            </CardContent>
          </Card>
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
        </>
      )}
    </div>
  );
}
