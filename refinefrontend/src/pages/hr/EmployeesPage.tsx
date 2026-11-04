import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useList, usePermissions } from "@refinedev/core";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { RotateCw, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayName } from "@/lib/format";
import { HR_ROLES, hasModuleAccess } from "@/lib/roles";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { RadioChipGroup } from "@/components/RadioChipGroup";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { StatePanel } from "@/components/StatePanel";
import { InviteSheet } from "./staff-overview/InviteSheet";
import { EmployeesTable } from "./employees-list/EmployeesTable";
import { EmployeeStatusCell } from "./employees-list/EmployeeStatusCell";
import { SORT_KEYS, STATUSES, type Employee, type SortKey } from "./employees-list/types";

function sortValue(e: Employee, key: SortKey): string {
  return key === "employee_name" ? displayName(e) : (e[key] ?? "");
}

const ALL = "";

export default function EmployeesPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [statusParam, setStatusParam] = useQueryState("status", parseAsStringLiteral(STATUSES));
  const [sortParam, setSortParam] = useQueryState("sort", parseAsStringLiteral(SORT_KEYS).withDefault("employee_name").withOptions({ clearOnDefault: true }));
  const [dirParam, setDirParam] = useQueryState("dir", parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc").withOptions({ clearOnDefault: true }));
  const [inviteOpen, setInviteOpen] = useState(false);
  const status = statusParam ?? ALL;
  const sort = useMemo(() => ({ key: sortParam, dir: (dirParam === "desc" ? -1 : 1) as 1 | -1 }), [sortParam, dirParam]);

  const { data: userRoles } = usePermissions<string[]>({});
  const canInvite = hasModuleAccess(userRoles ?? [], HR_ROLES);

  const { result, query } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name", "designation", "department", "status", "relieving_date", "custom_last_review_date", "custom_is_probation"] },
  });
  useEffect(() => {
    if (query.isError) console.error("Employees list failed", query.error);
  }, [query.isError, query.error]);

  const employees = useMemo(() => (result?.data ?? []) as Employee[], [result]);

  const statusOptions = useMemo(
    () => [
      { value: ALL, label: `All · ${employees.length}` },
      ...STATUSES.map((s) => ({ value: s as string, label: `${s} · ${employees.filter((e) => e.status === s).length}` })),
    ],
    [employees],
  );

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return employees
      .filter((e) => !status || e.status === status)
      .filter((e) => !s || `${displayName(e)} ${e.employee_name} ${e.designation ?? ""}`.toLowerCase().includes(s))
      .sort((a, b) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key)) * sort.dir);
  }, [employees, search, status, sort]);

  const isFiltered = !!search || !!status;

  function toggleSort(key: SortKey) {
    if (sort.key === key) void setDirParam(sort.dir === 1 ? "desc" : "asc");
    else {
      void setSortParam(key);
      void setDirParam("asc");
    }
  }

  let body;
  if (query.isError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load employees"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (query.isLoading) {
    body = <StaffSkeleton />;
  } else if (rows.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={isFiltered ? "No employees match" : "No employees yet"}
        text={isFiltered ? "Try a different search or status." : "Employees appear here once they are added."}
      />
    );
  } else if (!isDesktop) {
    body = (
      <ul className="flex flex-col gap-2.5">
        {rows.map((e) => (
          <li key={e.name}>
            <Link
              to={`/hr/employees/${e.name}`}
              className="flex min-h-[72px] items-center gap-3 rounded-2xl border bg-card p-3 text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StaffAvatar name={displayName(e)} id={e.name} className="h-10 w-10 text-sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="truncate text-base">{displayName(e)}</b>
                <span className="truncate text-[13px] text-muted-foreground">
                  {[e.designation, e.department].filter(Boolean).join(" · ") || "-"}
                </span>
              </div>
              <div className="shrink-0"><EmployeeStatusCell employee={e} /></div>
            </Link>
          </li>
        ))}
      </ul>
    );
  } else {
    body = <EmployeesTable rows={rows} sort={sort} onSort={toggleSort} />;
  }

  return (
    <div className="flex flex-col gap-4 md:gap-[18px]">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/hr/staff-overview" className="hover:text-foreground hover:underline">Staff</Link> / Employees
      </nav>

      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Employees</h1>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} className="shrink-0">
            <UserPlus className="h-4 w-4" />
            <span className="md:hidden">Invite</span>
            <span className="max-md:hidden">Invite staff</span>
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-2">
        <label className="relative flex md:w-[300px]">
          <span className="sr-only">Search employees</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            inputMode="search"
            placeholder="Search name or job title"
            value={search}
            onChange={(e) => void setSearch(e.target.value)}
            className="rounded-full pl-11 max-md:pl-11"
          />
        </label>
        <RadioChipGroup
          aria-label="Status"
          options={statusOptions}
          value={status}
          onChange={(v) => void setStatusParam((STATUSES as readonly string[]).includes(v) ? (v as (typeof STATUSES)[number]) : null)}
          className="scrollbar-hide -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
          itemClassName="h-10 shrink-0 whitespace-nowrap px-3.5"
        />
      </div>

      {body}

      {inviteOpen && <InviteSheet onClose={() => setInviteOpen(false)} onInvited={() => void query.refetch()} />}
    </div>
  );
}
