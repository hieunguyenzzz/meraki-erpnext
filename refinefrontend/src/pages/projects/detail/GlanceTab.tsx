import { Link } from "react-router";
import { MapPin, Navigation, Phone, Plus } from "lucide-react";
import { EventsTimeline, pickGlanceEvents, type TimelineEvent } from "@/components/wedding/EventsTimeline";
import { TeamStack } from "@/components/wedding/TeamAvatars";
import { formatVNDCompact, formatVNDFull } from "@/lib/format";
import type { WeddingEvent } from "@/lib/weddingEvents";
import { teamMembersOf } from "./teamMembers";
import type { WeddingData } from "./useWeddingData";
import type { useWeddingExpenses } from "./useWeddingExpenses";

const card = "rounded-card border bg-card p-4";
const heading = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const roundBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground";

interface Props {
  w: WeddingData;
  events: WeddingEvent[];
  expenses: ReturnType<typeof useWeddingExpenses>;
  onOpenTab: (tab: string) => void;
}

/** Phone "Today" tab: venue, today's (or next) events, team, expenses shortcut, vendors, payments (Finance). */
export function GlanceTab({ w, events, expenses, onOpenTab }: Props) {
  const { name, project, venueName, customer, isFinance, showExpensesTab, totalValue, totalPaid, paidPct } = w;
  const timeline: TimelineEvent[] = events.map((e) => ({
    key: e.name,
    title: e.event_type,
    date: e.event_date,
    start: e.start_time ?? null,
    end: e.end_time ?? null,
    place: e.venue_area,
    guests: e.guest_count,
    staff: e.staff.map((s) => s.employee_name || s.employee),
  }));
  const picked = pickGlanceEvents(timeline);
  const members = teamMembersOf(w);
  const vendors: { category: string; supplier: string }[] = project?.custom_wedding_vendors ?? [];
  const budget: number = isFinance ? project?.custom_total_budget || 0 : 0;
  const mobile: string | undefined = customer?.mobile_no;

  return (
    <div className="flex flex-col gap-3">
      <div className={`${card} flex items-center gap-3 py-3 pr-3`}>
        <MapPin className="h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15px]">{venueName || "Venue not set"}</b>
          <div className="text-[13px] text-muted-foreground">{[project?.custom_service_type, project?.custom_wedding_type].filter(Boolean).join(" · ")}</div>
        </div>
        {mobile && (
          <a href={`tel:${mobile}`} aria-label="Call the couple" className={roundBtn}>
            <Phone className="h-5 w-5" />
          </a>
        )}
        {venueName && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName)}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Directions to the venue"
            className={roundBtn}
          >
            <Navigation className="h-5 w-5" />
          </a>
        )}
      </div>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className={heading}>{picked?.heading ?? "Events"}</h2>
        {picked ? <EventsTimeline events={picked.items} /> : <p className="text-sm text-muted-foreground">No upcoming events.</p>}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onOpenTab("details")} className={`${card} flex flex-col items-start gap-2.5 text-left`}>
          <h2 className={heading}>Team</h2>
          {members.length > 0 ? <TeamStack members={members} /> : <span className="text-sm text-muted-foreground">Not assigned</span>}
        </button>
        {showExpensesTab && (
          <section className={`${card} flex flex-col gap-2`}>
            <h2 className={heading}>Expenses</h2>
            <div className="text-lg font-bold tabular-nums" title={formatVNDFull(expenses.approvedTotal)}>
              {formatVNDCompact(expenses.approvedTotal)}
              {budget > 0 && <span className="ml-1 text-xs font-medium text-muted-foreground">/ {formatVNDCompact(budget).replace("VND ", "")}</span>}
            </div>
            {budget > 0 && (
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-warning" style={{ width: `${Math.min(100, Math.round((expenses.approvedTotal / budget) * 100))}%` }} />
              </div>
            )}
            <Link to={`/finance/expenses/new?project=${encodeURIComponent(name)}`} className="mt-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary-fill text-sm font-semibold text-primary-fill-foreground">
              <Plus className="h-4 w-4" />
              Add expense
            </Link>
          </section>
        )}
      </div>

      {isFinance && totalValue > 0 && (
        <button type="button" onClick={() => onOpenTab("details")} className={`${card} flex flex-col gap-2 text-left`}>
          <h2 className={heading}>Payments</h2>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-3xl font-semibold lining-nums">{paidPct}% <span className="font-sans text-sm font-normal text-muted-foreground">paid</span></span>
            <span className="text-sm tabular-nums text-muted-foreground" title={`${formatVNDFull(totalPaid)} of ${formatVNDFull(totalValue)}`}>
              {formatVNDCompact(totalPaid)} of {formatVNDCompact(totalValue)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-success" style={{ width: `${Math.min(paidPct, 100)}%` }} />
          </div>
        </button>
      )}

      <section className={`${card} flex flex-col gap-1 py-3`}>
        <div className="flex items-center justify-between">
          <h2 className={`${heading} py-1`}>Vendors</h2>
          <button type="button" onClick={() => onOpenTab("vendors")} className="text-sm font-semibold text-primary">
            {vendors.length > 0 ? `All ${vendors.length}` : "Add"}
          </button>
        </div>
        {vendors.length === 0 && <p className="py-2 text-sm text-muted-foreground">No vendors added yet.</p>}
        {vendors.slice(0, 4).map((v, i) => (
          <div key={i} className={`flex min-h-12 items-center text-[15px] ${i > 0 ? "border-t" : ""}`}>
            <span className="min-w-0 flex-1 truncate">
              {v.category} · <span className="text-muted-foreground">{w.allSuppliers.find((s) => s.name === v.supplier)?.supplier_name || v.supplier}</span>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
