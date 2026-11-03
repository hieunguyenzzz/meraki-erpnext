import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EventsTimeline, pickGlanceEvents, type TimelineEvent } from "@/components/wedding/EventsTimeline";
import { FactList, SectionCard } from "@/components/wedding/SectionCard";
import { TeamList } from "@/components/wedding/TeamAvatars";
import { WeddingHero } from "@/components/wedding/WeddingHero";
import { formatVNDFull } from "@/lib/format";
import { HttpError, ROLE_LABEL, useMyWedding } from "@/hooks/useMyWeddings";

/** Read-only wedding view for assigned staff. No price, commission or payment data. */
export default function MyWeddingDetailPage() {
  const { name } = useParams();
  const navigate = useNavigate();
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

  const timeline: TimelineEvent[] = w.events.map((ev) => ({
    key: ev.name,
    title: ev.event_type,
    date: ev.event_date,
    start: ev.start_time,
    end: ev.end_time,
    place: ev.venue_name,
    guests: ev.guest_count,
    staff: ev.staff.map((s) => s.name),
  }));
  const picked = pickGlanceEvents(timeline);
  const others = timeline.filter((e) => !picked?.items.includes(e)).sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));

  return (
    <div className="space-y-5">
      <WeddingHero
        title={w.project_name}
        date={w.wedding_date}
        facts={[w.venue_name, w.guest_count ? `${w.guest_count} guests` : null]}
        badges={<Badge variant="secondary">{w.stage}</Badge>}
        subtitle={ROLE_LABEL[w.my_role]}
        daysToGo={w.days_to_go}
        onBack={() => navigate("/my-weddings")}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-4">
        <SectionCard title={picked?.heading ?? "Events"}>
          {picked ? <EventsTimeline events={picked.items} /> : w.events.length === 0 && <p className="text-sm text-muted-foreground">No events scheduled yet.</p>}
          {others.length > 0 && (
            <ul className="space-y-2 border-t pt-3 text-sm">
              {others.map((e) => (
                <li key={e.key} className="flex justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span className="tabular-nums text-muted-foreground">{e.date}{e.start ? ` · ${e.start.slice(0, 5)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Details">
          <FactList
            rows={[
              { label: "Couple", value: w.customer_name || "-" },
              { label: "Service", value: w.package || "-" },
              { label: "Type", value: w.wedding_type || "-" },
            ]}
          />
        </SectionCard>

        <SectionCard title="Team">
          <TeamList members={w.team.map((t) => ({ id: t.employee, name: t.name, role: ROLE_LABEL[t.role] ?? t.role }))} />
        </SectionCard>

        <SectionCard
          title="My expenses"
          action={
            <Link to={`/finance/expenses/new?project=${encodeURIComponent(w.id)}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-fill px-3 text-sm font-semibold text-primary-fill-foreground">
              <Plus className="h-4 w-4" />Add expense
            </Link>
          }
        >
          {w.my_expenses.length === 0 && <p className="text-sm text-muted-foreground">You have not logged any expenses here.</p>}
          {w.my_expenses.map((e) => (
            <div key={e.name} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate">{e.description || e.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{e.date}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums">{formatVNDFull(e.amount)}</span>
                <Badge variant={e.status === "Approved" ? "success" : e.status === "Rejected" ? "destructive" : "warning"}>{e.status}</Badge>
              </div>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  );
}
