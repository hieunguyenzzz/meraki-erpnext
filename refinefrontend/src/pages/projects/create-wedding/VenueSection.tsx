import { useState } from "react";
import { Field, FormSection } from "./FormSection";
import { CreatableCombobox } from "./CreatableCombobox";
import { apiErrorMessage, type FormData } from "./types";

interface Props {
  form: FormData;
  onChange: (updates: Partial<FormData>) => void;
  venues: { name: string; supplier_name: string }[];
}

export function VenueSection({ form, onChange, venues }: Props) {
  const [venueError, setVenueError] = useState<string | null>(null);
  // Label of a venue created in this session, until the Supplier list refreshes.
  const [createdLabel, setCreatedLabel] = useState("");

  async function createVenue(venueName: string): Promise<boolean> {
    setVenueError(null);
    try {
      const resp = await fetch("/api/resource/Supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": "erp.merakiwp.com" },
        credentials: "include",
        body: JSON.stringify({
          supplier_name: venueName,
          supplier_group: "Wedding Venues",
          supplier_type: "Company",
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(apiErrorMessage(body, `Failed to create venue (${resp.status})`));
      }
      const result = await resp.json();
      onChange({ venue: result?.data?.name ?? venueName });
      setCreatedLabel(result?.data?.supplier_name ?? venueName);
      return true;
    } catch (err) {
      console.error("Create venue failed", err);
      const msg = err instanceof Error ? err.message : "Failed to create venue";
      setVenueError(`Could not create venue: ${msg}`);
      return false;
    }
  }

  return (
    <FormSection title="Venue">
      <Field label="Venue" htmlFor="venue">
        <CreatableCombobox
          id="venue"
          options={venues.map((v) => ({ value: v.name, label: v.supplier_name }))}
          value={form.venue}
          valueLabel={createdLabel || form.venue}
          placeholder="Search or create venue..."
          searchPlaceholder="Search venues..."
          emptyText="No venues found."
          onSelect={(o) => onChange({ venue: o.value })}
          onCreate={createVenue}
          error={venueError}
          onSearchChange={() => setVenueError(null)}
        />
      </Field>
    </FormSection>
  );
}
