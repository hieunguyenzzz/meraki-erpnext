import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useList, useOne, usePermissions } from "@refinedev/core";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { EmployeeReviewsTab } from "@/components/staff-review/EmployeeReviewsTab";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { FINANCE_ROLES, hasModuleAccess } from "@/lib/roles";
import type { Employee } from "@/lib/types";
import { DeleteDialog } from "./employee-detail/DeleteDialog";
import { EditSectionSheet } from "./employee-detail/EditSectionSheet";
import { EmployeeHeader } from "./employee-detail/EmployeeHeader";
import { LeaveBalanceCard } from "./employee-detail/LeaveBalanceCard";
import { LeaveBalanceSheet } from "./employee-detail/LeaveBalanceSheet";
import { ContactCard, EmploymentCard, PersonalCard } from "./employee-detail/OverviewCards";
import { AllowanceCard, CommissionCard } from "./employee-detail/RatesCards";
import { RecordsTab } from "./employee-detail/RecordsTab";
import { ReviewTab } from "./employee-detail/ReviewTab";
import { ScheduleReviewDialog } from "./employee-detail/ScheduleReviewDialog";
import { StatusDialog } from "./employee-detail/StatusDialog";
import type { EditSection, LeaveAllocation, UserOption } from "./employee-detail/types";
import { useEmployeeRecords } from "./employee-detail/useEmployeeRecords";
import { useLeaveDetail } from "./employee-detail/useLeaveDetail";

const TABS = ["overview", "records", "review", "reviews"] as const;

export default function EmployeeDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("overview").withOptions({ clearOnDefault: true }));

  const [editSection, setEditSection] = useState<EditSection | null>(null);
  const [leaveAlloc, setLeaveAlloc] = useState<LeaveAllocation | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [displayUserRoles, setDisplayUserRoles] = useState<string[]>([]);

  const { data: roles } = usePermissions<string[]>({});
  const isFinance = hasModuleAccess(roles ?? [], FINANCE_ROLES);
  const canManageRoles = (roles ?? []).some((r) => r === "System Manager" || r === "Administrator");

  const { result: employee, query: employeeQuery } = useOne<Employee>({ resource: "Employee", id: name! });

  // Active users for the leave approver dropdown
  const { result: usersResult } = useList({
    resource: "User",
    pagination: { mode: "off" },
    filters: [{ field: "enabled", operator: "eq", value: 1 }],
    meta: { fields: ["name", "full_name", "email"] },
  });
  const users = useMemo(() => (usersResult?.data ?? []) as unknown as UserOption[], [usersResult]);

  const { result: designationsResult } = useList({
    resource: "Designation",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
    meta: { fields: ["name"] },
  });
  const designations = useMemo(() => (designationsResult?.data ?? []) as unknown as { name: string }[], [designationsResult]);

  const leave = useLeaveDetail(name);
  const records = useEmployeeRecords(name, leave.refetch);

  // Roles of the linked user, shown as badges on the Employment card
  useEffect(() => {
    if (!employee?.user_id) {
      setDisplayUserRoles([]);
      return;
    }
    fetch(`/api/resource/User/${encodeURIComponent(employee.user_id)}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`User roles ${r.status}`);
        return r.json();
      })
      .then((data) => setDisplayUserRoles(((data?.data?.roles ?? []) as { role: string }[]).map((r) => r.role)))
      .catch((err) => {
        console.error("Could not load user roles for", employee.user_id, err);
        setDisplayUserRoles([]);
      });
  }, [employee?.user_id]);

  if (employeeQuery.isError) {
    return <p role="alert" className="text-sm text-danger-soft-foreground">Could not load this employee. Go back and try again.</p>;
  }
  if (!employee) return <DetailSkeleton />;

  const tabsListClass = isDesktop
    ? "h-12 w-full justify-start gap-6 overflow-x-auto"
    : "h-auto w-full justify-start gap-1 overflow-x-auto rounded-full border-0 bg-secondary p-1";
  const triggerClass = isDesktop
    ? "h-12 shrink-0 gap-1.5 px-0 text-[15px]"
    : "mb-0 h-10 shrink-0 gap-1.5 rounded-full border-b-0 px-4 data-[state=active]:border-b-0 data-[state=active]:bg-card data-[state=active]:shadow-sm";

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <EmployeeHeader
        employee={employee}
        onBack={() => navigate(-1)}
        onSchedule={() => setScheduleOpen(true)}
        onStatus={() => setStatusOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="overview" className={triggerClass}>Overview</TabsTrigger>
          <TabsTrigger value="records" className={triggerClass}>
            Leave &amp; WFH
            {records.pendingCount > 0 && <Badge variant="destructive" className="h-5 px-1.5">{records.pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="review" className={triggerClass}>Review</TabsTrigger>
          <TabsTrigger value="reviews" className={triggerClass}>Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <PersonalCard employee={employee} onEdit={setEditSection} />
            <ContactCard employee={employee} onEdit={setEditSection} />
            <EmploymentCard employee={employee} users={users} displayUserRoles={displayUserRoles} onEdit={setEditSection} />
            <LeaveBalanceCard balance={leave.balance} periods={leave.periods} loadError={leave.error} loading={leave.loading} onEdit={setLeaveAlloc} />
            {isFinance && <CommissionCard employee={employee} onEdit={setEditSection} />}
            {isFinance && <AllowanceCard employee={employee} onEdit={setEditSection} />}
          </div>
        </TabsContent>

        <TabsContent value="records" className="mt-4">
          <RecordsTab
            records={records.records}
            loading={records.loading}
            loadError={records.loadError}
            processingId={records.processingId}
            error={records.recordsError}
            onApprove={records.approve}
            onReject={records.reject}
          />
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <ReviewTab employee={employee.name} onSchedule={() => setScheduleOpen(true)} />
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <EmployeeReviewsTab employeeName={employee.name} />
        </TabsContent>
      </Tabs>

      {statusOpen && <StatusDialog employee={employee} open onOpenChange={setStatusOpen} />}
      {deleteOpen && <DeleteDialog employee={employee} open onOpenChange={setDeleteOpen} />}
      {scheduleOpen && <ScheduleReviewDialog employee={employee} open onOpenChange={setScheduleOpen} />}
      {leaveAlloc && (
        <LeaveBalanceSheet
          alloc={leaveAlloc}
          employeeName={employee.employee_name}
          onClose={() => setLeaveAlloc(null)}
          onSaved={leave.refetch}
        />
      )}
      {editSection && (
        <EditSectionSheet
          key={editSection}
          employee={employee}
          section={editSection}
          users={users}
          designations={designations}
          canManageRoles={canManageRoles}
          onClose={() => setEditSection(null)}
        />
      )}
    </div>
  );
}
