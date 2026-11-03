import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { ArrowDown, ArrowUp, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { displayName } from "@/lib/format";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { StaffFilterBar } from "@/components/staff/StaffFilterBar";
import { StaffSkeleton } from "@/components/staff/StaffSkeleton";
import { EmployeeStatusBadge } from "@/components/staff/EmployeeStatusBadge";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";

interface Employee {
  name: string;
  employee_name: string;
  first_name?: string;
  last_name?: string;
  designation: string;
  department: string;
  status: string;
  custom_last_review_date?: string;
  custom_is_probation?: number;
}

const STATUSES = ["Active", "Inactive", "Suspended", "Left"] as const;

function timeSinceReview(d?: string): string {
  if (!d) return "Never";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 0) return "Upcoming";
  const mo = Math.floor(days / 30);
  const dd = days % 30;
  return mo > 0 ? `${mo}mo ${dd}d ago` : `${dd}d ago`;
}

const SORT_KEYS = ["employee_name", "designation", "department", "status", "custom_last_review_date"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "employee_name", label: "Name" },
  { key: "designation", label: "Designation" },
  { key: "department", label: "Department" },
  { key: "status", label: "Status" },
  { key: "custom_last_review_date", label: "Last review" },
];

function sortValue(e: Employee, key: SortKey): string {
  return key === "employee_name" ? displayName(e) : (e[key] ?? "");
}

export default function EmployeesPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [statusParam, setStatusParam] = useQueryState("status", parseAsStringLiteral(STATUSES));
  const [deptParam, setDeptParam] = useQueryState("dept", parseAsString);
  const [sortParam, setSortParam] = useQueryState("sort", parseAsStringLiteral(SORT_KEYS).withDefault("employee_name").withOptions({ clearOnDefault: true }));
  const [dirParam, setDirParam] = useQueryState("dir", parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc").withOptions({ clearOnDefault: true }));
  const status = statusParam ?? "";
  const sort = useMemo(() => ({ key: sortParam, dir: (dirParam === "desc" ? -1 : 1) as 1 | -1 }), [sortParam, dirParam]);

  const { result, query } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name", "designation", "department", "status", "custom_last_review_date", "custom_is_probation"] },
  });
  useEffect(() => {
    if (query.isError) console.error("Employees list failed", query.error);
  }, [query.isError, query.error]);

  const employees = useMemo(() => (result?.data ?? []) as Employee[], [result]);

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort().map((d) => ({ label: d, value: d })),
    [employees],
  );

  // A dept in the URL that matches no loaded department is ignored
  const department = deptParam && departments.some((d) => d.value === deptParam) ? deptParam : "";

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return employees
      .filter((e) => (!status || e.status === status) && (!department || e.department === department))
      .filter((e) => !s || `${displayName(e)} ${e.employee_name}`.toLowerCase().includes(s))
      .sort((a, b) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key)) * sort.dir);
  }, [employees, search, status, department, sort]);

  const isFiltered = !!search || !!status || !!department;

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
        text={isFiltered ? "Try a different search, status or department." : "Employees appear here once they are added."}
      />
    );
  } else {
    body = (
      <>
        <span className="px-1 text-[13px] text-muted-foreground md:text-sm">
          {rows.length} employee{rows.length === 1 ? "" : "s"}
        </span>

        {!isDesktop ? (
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <EmployeeStatusBadge status={e.status} />
                    {!!e.custom_is_probation && <Badge variant="warning">Probation</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                        className="whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground"
                      >
                        <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {c.label}
                          {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.name} className="border-t">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link to={`/hr/employees/${e.name}`} className="flex items-center gap-2.5 font-semibold text-foreground hover:underline">
                          <StaffAvatar name={displayName(e)} id={e.name} />
                          {displayName(e)}
                          {!!e.custom_is_probation && <Badge variant="warning">Probation</Badge>}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{e.designation || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3">{e.department || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3"><EmployeeStatusBadge status={e.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{timeSinceReview(e.custom_last_review_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Employees</h1>
        <p className="text-sm text-muted-foreground">Manage your team members</p>
      </header>

      <StaffFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search employees"
        filters={[
          { key: "status", label: "Status", allLabel: "All statuses", value: status, onChange: (v: string) => void setStatusParam((STATUSES as readonly string[]).includes(v) ? (v as (typeof STATUSES)[number]) : null), options: [...STATUSES].map((s) => ({ label: s, value: s })) },
          { key: "dept", label: "Department", allLabel: "All departments", value: department, onChange: (v: string) => void setDeptParam(v || null), options: departments },
        ]}
      />

      {body}
    </div>
  );
}
