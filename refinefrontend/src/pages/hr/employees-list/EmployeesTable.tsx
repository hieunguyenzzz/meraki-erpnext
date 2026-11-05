import { Link, useNavigate } from "react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { displayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { EmployeeStatusCell } from "./EmployeeStatusCell";
import type { Employee, SortKey } from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "employee_name", label: "Name" },
  { key: "designation", label: "Job title" },
  { key: "department", label: "Department" },
  { key: "status", label: "Status" },
  { key: "custom_last_review_date", label: "Last review" },
];

// Inactive and Left rows are greyed out per the design
const isMuted = (e: Employee) => e.status !== "Active" && e.status !== "Suspended";

interface Props {
  rows: Employee[];
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
}

export function EmployeesTable({ rows, sort, onSort }: Props) {
  const navigate = useNavigate();
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className="whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground"
                >
                  <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {c.label}
                    {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const muted = isMuted(e);
              return (
                <tr
                  key={e.name}
                  onClick={() => navigate(`/hr/employees/${e.name}`)}
                  className={cn("cursor-pointer border-t hover:bg-muted/40", muted && "text-muted-foreground")}
                >
                  <td className="whitespace-nowrap px-4">
                    <Link to={`/hr/employees/${e.name}`} onClick={(ev) => ev.stopPropagation()} className={cn("flex min-h-[52px] items-center gap-2.5 hover:underline", !muted && "font-semibold text-foreground")}>
                      <StaffAvatar name={displayName(e)} id={e.name} className={cn("h-8 w-8 text-[11px]", muted && "bg-muted text-muted-foreground")} />
                      {displayName(e)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4">{e.designation || "-"}</td>
                  <td className="whitespace-nowrap px-4">{e.department || "-"}</td>
                  <td className="whitespace-nowrap px-4"><EmployeeStatusCell employee={e} /></td>
                  <td className="whitespace-nowrap px-4">{e.custom_last_review_date || "Never"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
