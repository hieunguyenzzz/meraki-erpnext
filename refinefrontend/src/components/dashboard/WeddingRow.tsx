import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { countdownLabel, ROLE_LABEL, type MyWedding } from "@/hooks/useMyWeddings";

/** One assigned wedding as a tappable card (Home and My Weddings). */
export function WeddingRow({ wedding: w }: { wedding: MyWedding }) {
  const days = countdownLabel(w.days_to_go);
  return (
    <Link
      to={`/my-weddings/${w.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{w.project_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[formatDate(w.wedding_date), w.venue_name].filter((v) => v && v !== "-").join(" · ")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{ROLE_LABEL[w.my_role]} · {w.stage}</p>
      </div>
      {days && (
        <Badge variant={w.days_to_go != null && w.days_to_go >= 0 && w.days_to_go <= 7 ? "destructive" : "secondary"} className="shrink-0">
          {days}
        </Badge>
      )}
    </Link>
  );
}
