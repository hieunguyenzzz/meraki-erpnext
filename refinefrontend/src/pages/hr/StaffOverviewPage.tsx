import { useMemo, useState } from "react";
import { usePermissions } from "@refinedev/core";
import { useQueryState } from "nuqs";
import { RotateCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayName } from "@/lib/format";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import { StaffFilterBar } from "@/components/staff/StaffFilterBar";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";
import { StaffKpis } from "./staff-overview/StaffKpis";
import { StaffTable } from "./staff-overview/StaffTable";
import { StaffCards } from "./staff-overview/StaffCards";
import { StaffActionsSheet } from "./staff-overview/StaffActionsSheet";
import { ReviewSheet } from "./staff-overview/ReviewSheet";
import { RolesSheet } from "./staff-overview/RolesSheet";
import { InviteSheet } from "./staff-overview/InviteSheet";
import { useStaffOverview } from "./staff-overview/useStaffOverview";
import type { StaffRow } from "./staff-overview/types";

export default function StaffOverviewPage() {
  const [view, setView] = useQueryState("view", { defaultValue: "" });
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [role, setRole] = useQueryState("role", { defaultValue: "" });
  const [department, setDepartment] = useQueryState("dept", { defaultValue: "" });

  const [reviewing, setReviewing] = useState<StaffRow | null>(null);
  const [assigning, setAssigning] = useState<StaffRow | null>(null);
  const [actionsFor, setActionsFor] = useState<StaffRow | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: userRoles } = usePermissions<string[]>({});
  const canManageRoles = (userRoles ?? []).some((r) => r === "System Manager" || r === "Administrator");

  const { summary, total, orderedStaff, isLoading, isError, refetch, setRolesMap, handleDragEnd } = useStaffOverview();

  const probationCount = useMemo(() => orderedStaff.filter((r) => r.is_probation).length, [orderedStaff]);
  const departments = useMemo(
    () => [...new Set(orderedStaff.map((r) => r.department).filter((d) => d && d !== "-"))].sort().map((d) => ({ label: d, value: d })),
    [orderedStaff],
  );

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
    setReviewing(row);
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
        <StaffCards rows={rows} onActions={setActionsFor} />
        <StaffTable rows={rows} canManageRoles={canManageRoles} onReview={openReview} onRoles={openRoles} onDragEnd={handleDragEnd} />
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

      <StaffActionsSheet row={actionsFor} canManageRoles={canManageRoles} onClose={() => setActionsFor(null)} onReview={openReview} onRoles={openRoles} />
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
