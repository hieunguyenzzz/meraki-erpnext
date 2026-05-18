import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { VenueSupplier } from "@/lib/types";

export interface ContactView {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  alt_phone?: string;
}

interface VenueContactTabProps {
  venue: VenueSupplier;
  contact?: ContactView | null;
}

function hasAnyField(c: ContactView): boolean {
  return Boolean(c.name || c.title || c.email || c.phone || c.alt_phone);
}

function ContactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-0.5">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

function ParsedContactCard({ contact }: { contact: ContactView }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold mb-3">Contact</p>
      <div className="border-t pt-3 space-y-2">
        {contact.name && (
          <ContactRow label="Name">{contact.name}</ContactRow>
        )}
        {contact.title && (
          <ContactRow label="Title">{contact.title}</ContactRow>
        )}
        {contact.email && (
          <ContactRow label="Email">
            <a
              href={`mailto:${contact.email}`}
              className="text-primary hover:underline"
            >
              {contact.email}
            </a>
          </ContactRow>
        )}
        {contact.phone && (
          <ContactRow label="Phone">
            <a
              href={`tel:${contact.phone}`}
              className="text-primary hover:underline"
            >
              {contact.phone}
            </a>
          </ContactRow>
        )}
        {contact.alt_phone && (
          <ContactRow label="Alt">
            <a
              href={`tel:${contact.alt_phone}`}
              className="text-primary hover:underline"
            >
              {contact.alt_phone}
            </a>
          </ContactRow>
        )}
      </div>
    </div>
  );
}

const PREVIEW_LENGTH = 80;

function RawContactCard({ raw }: { raw: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = raw.length > PREVIEW_LENGTH;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Original text</p>
        {isLong && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-0.5 px-2 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "Show"}
          </Button>
        )}
      </div>
      <div className="border-t pt-3">
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {isLong && !expanded
            ? raw.slice(0, PREVIEW_LENGTH) + "..."
            : raw}
        </p>
      </div>
    </div>
  );
}

export function VenueContactTab({ venue, contact }: VenueContactTabProps) {
  const showContact = contact != null && hasAnyField(contact);
  const showRaw = Boolean(venue.custom_venue_contact_raw?.trim());

  if (!showContact && !showRaw) {
    return (
      <p className="text-sm text-muted-foreground">
        No contact information recorded yet.
      </p>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {showContact && <ParsedContactCard contact={contact!} />}
      {showRaw && (
        <RawContactCard raw={venue.custom_venue_contact_raw!} />
      )}
    </div>
  );
}
