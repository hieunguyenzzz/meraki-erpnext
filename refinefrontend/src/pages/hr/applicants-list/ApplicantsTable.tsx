import { Link } from "react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STAGE_BADGE } from "@/components/recruiting/stageBadge";
import { ratingToStars } from "@/lib/recruiting-kanban";
import { Pager } from "./Pager";
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
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

/** ERPNext keeps the rating as a 0-1 fraction; the design shows a bar and a score out of 5. */
function RatingBar({ value }: { value: number }) {
  if (!ratingToStars(value)) return <span className="text-muted-foreground">—</span>;
  const score = value * 5;
  return (
    <span className="flex items-center gap-2" role="img" aria-label={`Rating ${score.toFixed(1)} out of 5`}>
      <span className="h-1.5 w-[60px] rounded-[3px] bg-muted" aria-hidden><span className="block h-1.5 rounded-[3px] bg-success" style={{ width: `${Math.min(100, value * 100)}%` }} /></span>
      <b className="tabular-nums">{score.toFixed(1)}</b>
    </span>
  );
}

/** Desktop table (D-Applicants): rounded card, muted header, sortable columns, pager footer. */
export function ApplicantsTable({ rows, sort, onSort, selected, onToggle, onToggleAll, page, pageSize, total, onPage }: Props) {
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
                    <Link to={`/hr/recruiting/${a.name}`} className="font-bold text-foreground hover:underline">{a.applicant_name || a.name}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{a.job_title || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3"><Badge variant={STAGE_BADGE[stage] ?? "secondary"}>{stage}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3">{a.source || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{a.creation.slice(0, 10)}</td>
                  <td className="whitespace-nowrap px-4 py-3"><RatingBar value={a.applicant_rating} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={pageSize} total={total} onPage={onPage} />
    </div>
  );
}
