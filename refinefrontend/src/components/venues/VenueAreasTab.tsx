import { Users, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VenueWeddingArea } from "@/lib/types";

interface VenueAreasTabProps {
  areas: VenueWeddingArea[];
  onEditAreas?: () => void;
}

function formatCapacity(area: VenueWeddingArea): string | null {
  const min = typeof area.capacity_min === "number" && area.capacity_min > 0
    ? area.capacity_min
    : null;
  const max = typeof area.capacity_max === "number" && area.capacity_max > 0
    ? area.capacity_max
    : null;

  if (min !== null && max !== null && min !== max) return `${min} \u2013 ${max} pax`;
  if (min !== null && max !== null && min === max) return `${min} pax`;
  if (min !== null) return `${min} pax`;
  if (max !== null) return `${max} pax`;
  return null;
}

const AREA_DETAIL_FIELDS: Array<{
  key: keyof VenueWeddingArea;
  label: string;
}> = [
  { key: "function",          label: "Function" },
  { key: "policy_min_spend",  label: "Policy" },
  { key: "setup_notes",       label: "Setup" },
  { key: "meraki_weddings",   label: "Meraki's weddings" },
];

function AreaCard({ area }: { area: VenueWeddingArea }) {
  const capacityText = formatCapacity(area);

  return (
    <div className="border rounded-md p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-snug">{area.area_name}</h3>
        {area.area_type && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {area.area_type}
          </Badge>
        )}
      </div>

      {/* Capacity */}
      {capacityText && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{capacityText}</span>
          </div>
          {area.capacity_notes && (
            <p className="text-xs text-muted-foreground pl-5">
              {area.capacity_notes}
            </p>
          )}
        </div>
      )}

      {/* Detail fields */}
      {AREA_DETAIL_FIELDS.map(({ key, label }) => {
        const value = area[key];
        if (!value || typeof value !== "string" || !value.trim()) return null;
        return (
          <div key={key} className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground">{label}</p>
            <p className="text-sm whitespace-pre-wrap">{value}</p>
          </div>
        );
      })}

      {/* Photos link */}
      {area.photos_url && (
        <a
          href={area.photos_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          View photos <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export function VenueAreasTab({ areas, onEditAreas }: VenueAreasTabProps) {
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {areas.length} area{areas.length === 1 ? "" : "s"}
        </p>
        {onEditAreas && (
          <Button variant="outline" size="sm" onClick={onEditAreas}>
            Edit areas
          </Button>
        )}
      </div>

      {areas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No areas defined yet. Click 'Edit' on the venue header to add some.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {areas.map((area) => (
            <AreaCard key={area.name} area={area} />
          ))}
        </div>
      )}
    </div>
  );
}
