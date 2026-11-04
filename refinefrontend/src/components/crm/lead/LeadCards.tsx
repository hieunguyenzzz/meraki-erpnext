import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { leadBudgetValue } from "@/lib/kanban";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { EditableField } from "@/components/crm/EditableField";
import { InfoCard } from "./InfoCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lead = Record<string, any>;

export function ContactCard({ lead, fullName, sources, onSaved }: {
  lead: Lead; fullName: string; sources: string[]; onSaved: () => void;
}) {
  return (
    <InfoCard title="Contact">
      <ReadOnlyField label="Name" value={fullName} />
      <ReadOnlyField label="Email" value={lead.email_id ?? ""} />
      <ReadOnlyField label="Phone" value={lead.phone ?? ""} />
      {lead.mobile_no && <ReadOnlyField label="Mobile" value={lead.mobile_no} />}
      <ReadOnlyField label="Location" value={lead.custom_current_location ?? lead.city ?? ""} />
      <EditableField
        label="Source"
        value={lead.source}
        fieldName="source"
        doctype="Lead"
        docName={lead.name}
        type="select"
        options={sources}
        onSaved={onSaved}
      />
    </InfoCard>
  );
}

/** Wedding facts as the couple typed them: the raw text wins over the parsed value. A missing fact shows "—". */
export function WeddingCard({ lead }: { lead: Lead }) {
  const date = lead.custom_wedding_date_raw || lead.custom_wedding_date?.slice(0, 10);
  const guests = lead.custom_guest_count_raw || (lead.custom_guest_count ? String(lead.custom_guest_count) : "");
  const budget = leadBudgetValue(lead) ?? "";

  return (
    <InfoCard title="Wedding">
      <ReadOnlyField label="Date" value={date || "—"} />
      <ReadOnlyField label="Venue" value={lead.custom_wedding_venue || "—"} />
      <ReadOnlyField label="Guests" value={guests || "—"} />
      <ReadOnlyField label="Budget" value={budget || "—"} />
      {lead.custom_couple_name && <ReadOnlyField label="Couple" value={lead.custom_couple_name} />}
      {lead.custom_partner_name && <ReadOnlyField label="Partner" value={lead.custom_partner_name} />}
    </InfoCard>
  );
}

/** The full enquiry text as the couple sent it (Lead.notes rows). */
export function SubmissionCard({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <InfoCard title="Submission">
      {notes.map((note, i) => (
        <p key={i} className="whitespace-pre-line break-words text-sm text-muted-foreground">{note}</p>
      ))}
    </InfoCard>
  );
}

export interface Meeting { name: string; subject: string; starts_on: string }

export function MeetingsCard({ meetings, error }: { meetings: Meeting[]; error?: boolean }) {
  if (error) {
    return (
      <InfoCard title="Meetings" icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}>
        <p role="status" className="text-sm text-warning-soft-foreground">Couldn't load meetings.</p>
      </InfoCard>
    );
  }
  if (meetings.length === 0) return null;
  return (
    <InfoCard title="Meetings" icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}>
      {meetings.map((m) => {
        const past = new Date(m.starts_on) < new Date();
        return (
          <div key={m.name} className={cn("rounded-lg border p-2.5 text-sm", past ? "bg-muted/40 text-muted-foreground" : "bg-info-soft text-info-soft-foreground")}>
            <p className={cn("font-medium", past && "line-through")}>{m.subject}</p>
            <p className="mt-0.5 text-xs">
              {m.starts_on.slice(0, 10)} at {m.starts_on.slice(11, 16)}
            </p>
          </div>
        );
      })}
    </InfoCard>
  );
}
