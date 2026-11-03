import { useMemo, useState } from "react";
import { usePermissions } from "@refinedev/core";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { RotateCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayName } from "@/lib/format";
import { ASSIGNABLE_ROLES, HR_ROLES, hasModuleAccess } from "@/lib/roles";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { StaffFilterBar } from "@/components/staff/StaffFilterBar";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/components/StatePanel";
import { StaffKpis } from "./staff-overview/StaffKpis";
import { StaffTable } from "./staff-overview/StaffTable";
import { StaffCards } from "./staff-overview/StaffCards";
import { StaffActionsSheet } from "./staff-overview/StaffActionsSheet";
import { ReviewSheet } from "./staff-overview/ReviewSheet";
import { RolesSheet } from "./staff-overview/RolesSheet";
import { InviteSheet } from "./staff-overview/InviteSheet";
import { useStaffOverview } from "./staff-overview/useStaffOverview";
import type { StaffRow } from "./staff-overview/types";

const VIEWS = ["probation"] as const;
const ROLE_VALUES = ASSIGNABLE_ROLES.map((r) => r.role);

export default function StaffOverviewPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [viewParam, setViewParam] = useQueryState("view", parseAsStringLiteral(VIEWS));
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [roleParam, setRoleParam] = useQueryState("role", parseAsStringLiteral(ROLE_VALUES));
  const [deptParam, setDeptParam] = useQueryState("dept", parseAsString);
  const view = viewParam ?? "";
  const role = roleParam ?? "";
  const setView = (v: string) => void setViewParam(v === "probation" ? "probation" : null);
  const setRole = (v: string) => void setRoleParam((ROLE_VALUES as readonly string[]).includes(v) ? (v as (typeof ROLE_VALUES)[number]) : null);
  const setDepartment = (v: string) => void setDeptParam(v || null);

  const [reviewing, setReviewing] = useState<StaffRow | null>(null);
  const [assigning, setAssigning] = useState<StaffRow | null>(null);
  const [actionsFor, setActionsFor] = useState<StaffRow | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: userRoles } = usePermissions<string[]>({});
  const canManageRoles = (userRoles ?? []).some((r) => r === "System Manager" || r === "Administrator");

  const canReview = hasModuleAccess(userRoles ?? [], HR_ROLES);

  const { summary, total, orderedStaff, isLoading, isError, orderError, refetch, setRolesMap, handleDragEnd } = useStaffOverview();

  const probationCount = useMemo(() => orderedStaff.filter((r) => r.is_probation).length, [orderedStaff]);
  const departments = useMemo(
    () => [...new Set(orderedStaff.map((r) => r.department).filter((d) => d && d !== "-"))].sort().map((d) => ({ label: d, value: d })),
    [orderedStaff],
  );

  // A dept in the URL that matches no loaded department is ignored
  const department = deptParam && departments.some((d) => d.value === deptParam) ? deptParam : "";

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orderedStaff.filter((r) => {
      if (view === "probation" && !r.is_probation) return false;
      if (role && !r.staff_roles.includes(role)) return false;
      if (department && r.department !== department) return false;
      if (s && !displayName(r).toLowerCase().includes(s)) return false;
      return true;
    });
  }, [orderedStaff, view, search, role, department]);

  const isFiltered = !!view || !!search || !!role || !!department;

  function openReview(row: StaffRow) {
    if (canReview) setReviewing(row);
  }
  function openRoles(row: StaffRow) {
    if (canManageRoles) setAssigning(row);
  }

  let body;
  if (isError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load staff"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: refetch, icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (isLoading && orderedStaff.length === 0) {
    body = <StaffSkeleton />;
  } else if (rows.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={isFiltered ? "No staff match" : "No staff yet"}
        text={isFiltered ? "Try a different search, role or department." : "Invite the first team member to get started."}
        action={isFiltered ? undefined : { label: "Invite staff", onClick: () => setInviteOpen(true) }}
      />
    );
  } else {
    body = (
      <>
        <span className="px-1 text-[13px] text-muted-foreground md:text-sm">
          {rows.length} staff
        </span>
        {orderError && <p role="alert" className="px-1 text-sm text-destructive">{orderError}</p>}
        {isDesktop ? (
          <StaffTable rows={rows} canManageRoles={canManageRoles} canReview={canReview} dragEnabled={!isFiltered} onReview={openReview} onRoles={openRoles} onDragEnd={handleDragEnd} />
        ) : (
          <StaffCards rows={rows} onActions={setActionsFor} />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Staff</h1>
        <Button onClick={() => setInviteOpen(true)} className="shrink-0">
          <UserPlus className="h-4 w-4" />
          <span className="md:hidden">Invite</span>
          <span className="max-md:hidden">Invite staff</span>
        </Button>
      </header>

      <StaffKpis total={total} probation={probationCount} summary={summary} view={view} onView={setView} />

      <StaffFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name"
        filters={[
          { key: "role", label: "Role", allLabel: "All roles", value: role, onChange: setRole, options: ASSIGNABLE_ROLES.map((r) => ({ label: r.label, value: r.role })) },
          { key: "dept", label: "Department", allLabel: "All departments", value: department, onChange: setDepartment, options: departments },
        ]}
      />

      {body}

      {!isDesktop && <StaffActionsSheet row={actionsFor} canManageRoles={canManageRoles} canReview={canReview} onClose={() => setActionsFor(null)} onReview={openReview} onRoles={openRoles} />}
      {reviewing && <ReviewSheet key={reviewing.name} employee={reviewing} onClose={() => setReviewing(null)} onSaved={refetch} />}
      {assigning && (
        <RolesSheet
          key={assigning.name}
          employee={assigning}
          onClose={() => setAssigning(null)}
          onSaved={(id, roles) => {
            setRolesMap((prev) => ({ ...prev, [id]: roles }));
            refetch();
          }}
        />
      )}
      {inviteOpen && <InviteSheet onClose={() => setInviteOpen(false)} onInvited={refetch} />}
    </div>
  );
}
