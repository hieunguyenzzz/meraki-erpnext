import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimelineEvent } from "@/components/wedding/EventsTimeline";
import { FactList, SectionCard } from "@/components/wedding/SectionCard";
import { TeamList } from "@/components/wedding/TeamAvatars";
import { WeddingHero } from "@/components/wedding/WeddingHero";
import { formatIsoWeekday } from "@/lib/format";
import { HttpError, ROLE_LABEL, useMyWedding } from "@/hooks/useMyWeddings";
import { EventsByDay } from "./my-weddings/EventsByDay";
import { MyExpensesList } from "./my-weddings/MyExpensesList";

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
  const addExpense = `/finance/expenses/new?project=${encodeURIComponent(w.id)}`;

  return (
    <div className="space-y-5">
      <WeddingHero
        title={w.project_name}
        date={w.wedding_date}
        facts={[w.venue_name, [w.guest_count ? `${w.guest_count} guests` : null, w.package].filter(Boolean).join(" · ") || null]}
        badges={
          <>
            <span className="basis-full md:hidden">You're on this team as <b className="text-info-soft-foreground">{ROLE_LABEL[w.my_role]}</b></span>
            <span className="hidden items-center gap-2 md:inline-flex">
              <span aria-hidden>·</span>You: <Badge variant="info">{ROLE_LABEL[w.my_role]}</Badge><Badge variant="secondary">Read-only</Badge>
            </span>
          </>
        }
        daysToGo={w.days_to_go}
        onBack={() => navigate("/my-weddings")}
        actions={
          <Link to={addExpense} className="hidden h-11 items-center gap-1.5 rounded-full bg-primary-fill px-[18px] text-[15px] font-semibold text-primary-fill-foreground md:flex">
            <Plus className="h-[18px] w-[18px]" aria-hidden />Add expense
          </Link>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-4">
        <SectionCard title="Details" className="max-md:hidden">
          <FactList
            rows={[
              { label: "Couple", value: w.customer_name || "-" },
              { label: "Date", value: w.wedding_date ? formatIsoWeekday(w.wedding_date) : "-" },
              { label: "Venue", value: w.venue_name || "-" },
              { label: "Guests", value: w.guest_count ?? "-" },
              { label: "Package", value: w.package || "-" },
              { label: "Type", value: w.wedding_type || "-" },
            ]}
          />
        </SectionCard>

        <SectionCard title="Team">
          <TeamList members={w.team.map((t) => ({ id: t.employee, name: t.name, role: ROLE_LABEL[t.role] ?? t.role, phone: t.phone }))} />
        </SectionCard>

        <SectionCard title="Events">
          <EventsByDay events={timeline} />
        </SectionCard>

        <SectionCard title="My expenses here">
          <MyExpensesList expenses={w.my_expenses} />
        </SectionCard>
      </div>

      {/* Thumb-reach action above the bottom bar (sticky offset clears the bottom nav and its centre button); desktop has it in the header. */}
      <div className="sticky bottom-2 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur md:hidden">
        <Link to={addExpense} className="flex min-h-14 items-center justify-center gap-2 rounded-full px-4 py-2 text-center bg-primary-fill text-[17px] font-semibold text-primary-fill-foreground shadow-lg">
          <Plus className="h-[22px] w-[22px]" aria-hidden />Add expense to {w.project_name}
        </Link>
      </div>
    </div>
  );
}
