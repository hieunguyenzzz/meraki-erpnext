import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatVND } from "@/lib/format";
import { countdownLabel, HttpError, ROLE_LABEL, useMyWedding } from "@/hooks/useMyWeddings";

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

/** Read-only wedding view for assigned staff. No price, commission or payment data. */
export default function MyWeddingDetailPage() {
  const { name } = useParams();
  const { wedding: w, isLoading, error } = useMyWedding(name);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !w) {
    return (
      <div className="space-y-3">
        <Link to="/my-weddings" className="inline-flex items-center gap-1 text-sm text-primary"><ArrowLeft className="h-4 w-4" /> My weddings</Link>
        <p className="text-sm text-muted-foreground">
          {error instanceof HttpError && error.status === 403 ? "You are not assigned to this wedding." : "Could not load this wedding."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/my-weddings" className="inline-flex items-center gap-1 text-sm text-primary"><ArrowLeft className="h-4 w-4" /> My weddings</Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{w.project_name}</h1>
          <p className="text-sm text-muted-foreground">{ROLE_LABEL[w.my_role]} · {w.stage}</p>
        </div>
        {w.days_to_go != null && <Badge variant="secondary">{countdownLabel(w.days_to_go)}</Badge>}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Overview</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Fact label="Date" value={formatDate(w.wedding_date)} />
          <Fact label="Venue" value={w.venue_name} />
          <Fact label="Couple" value={w.customer_name} />
          <Fact label="Guests" value={w.guest_count} />
          <Fact label="Service" value={w.package} />
          <Fact label="Type" value={w.wedding_type} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Team</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {w.team.map((t) => (
            <div key={t.employee} className="flex justify-between text-sm">
              <span>{t.name}</span><span className="text-muted-foreground">{ROLE_LABEL[t.role]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Events</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {w.events.length === 0 && <p className="text-sm text-muted-foreground">No events scheduled yet.</p>}
          {w.events.map((ev) => (
            <div key={ev.name} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{ev.event_type}</span>
                <span className="text-muted-foreground">
                  {formatDate(ev.event_date)}{ev.start_time ? ` · ${ev.start_time.slice(0, 5)}` : ""}
                </span>
              </div>
              {ev.notes && <p className="text-xs text-muted-foreground">{ev.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">My expenses</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {w.my_expenses.length === 0 && <p className="text-sm text-muted-foreground">You have not logged any expenses here.</p>}
          {w.my_expenses.map((e) => (
            <div key={e.name} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate">{e.description || e.name}</p>
                <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span>{formatVND(e.amount)}</span>
                <Badge variant={e.status === "Approved" ? "success" : e.status === "Rejected" ? "destructive" : "warning"}>{e.status}</Badge>
              </div>
            </div>
          ))}
          <Link to="/finance/expenses/new" className="inline-block pt-1 text-sm text-primary hover:underline">Add expense</Link>
        </CardContent>
      </Card>
    </div>
  );
}
