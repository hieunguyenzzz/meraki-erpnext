import { Link } from "react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { RatingStars } from "@/components/recruiting/RatingStars";
import { STAGE_BADGE } from "@/components/recruiting/stageBadge";
import { stageOf, type ApplicantRow, type Sort, type SortKey } from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "applicant_name", label: "Name" },
  { key: "job_title", label: "Position" },
  { key: "custom_recruiting_stage", label: "Stage" },
  { key: "source", label: "Source" },
  { key: "creation", label: "Applied" },
  { key: "applicant_rating", label: "Rating" },
];

interface Props {
  rows: ApplicantRow[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  selected: Set<string>;
  onToggle: (name: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
}

/** Desktop table, D-Staff style: rounded card, muted header, sortable columns. */
export function ApplicantsTable({ rows, sort, onSort, selected, onToggle, onToggleAll }: Props) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.name));
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="w-10 px-4 py-3">
                <input type="checkbox" aria-label="Select all shown" className="h-4 w-4 accent-[hsl(var(--primary-fill))]" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground">
                  <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {c.label}
                    {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const stage = stageOf(a);
              return (
                <tr key={a.name} className="border-t">
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Select ${a.applicant_name || a.name}`} className="h-4 w-4 accent-[hsl(var(--primary-fill))]" checked={selected.has(a.name)} onChange={(e) => onToggle(a.name, e.target.checked)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link to={`/hr/recruiting/${a.name}`} className="flex items-center gap-2.5 font-semibold text-foreground hover:underline">
                      <StaffAvatar name={a.applicant_name || a.name} id={a.name} />
                      {a.applicant_name || a.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{a.job_title || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3"><Badge variant={STAGE_BADGE[stage] ?? "secondary"}>{stage}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3">{a.source || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{a.creation.slice(0, 10)}</td>
                  <td className="whitespace-nowrap px-4 py-3"><RatingStars value={a.applicant_rating} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
