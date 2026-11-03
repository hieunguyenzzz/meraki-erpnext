import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { capacityBounds, capacityLabel, priceBadgeVariant } from "@/lib/venue";
import type { VenueRow } from "@/lib/venue";

const TINTS = [
  "bg-success-soft text-success-soft-foreground",
  "bg-info-soft text-info-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-accent text-accent-foreground",
  "bg-secondary text-secondary-foreground",
];

function tintFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

interface Props {
  venue: VenueRow;
  coverUrl?: string;
  showCity: boolean;
}

/** Photo card: stacked on desktop (grid), thumbnail-left row on phones. */
export function VenueCard({ venue, coverUrl, showCity }: Props) {
  const where = [venue.custom_venue_location_subarea, showCity ? venue.custom_venue_city : null].filter(Boolean).join(" · ");
  const bounds = capacityBounds(venue.areas);
  const phoneMeta = [where, bounds?.max ? `up to ${bounds.max}` : null].filter(Boolean).join(" · ");
  const desktopMeta = [where, capacityLabel(venue.areas)].filter(Boolean).join(" · ");
  const areaTypes = [...new Set(venue.areas.map((a) => a.area_type).filter(Boolean))].slice(0, 2) as string[];
  const tags = [venue.custom_venue_type, ...areaTypes].filter(Boolean) as string[];

  return (
    <Link
      to={`/venues/${encodeURIComponent(venue.name)}`}
      className="flex gap-3 overflow-hidden rounded-2xl border bg-card p-2.5 text-card-foreground transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-col md:gap-0 md:p-0"
    >
      <div
        className={cn(
          "flex h-24 w-24 shrink-0 items-end overflow-hidden rounded-xl md:h-[150px] md:w-full md:rounded-none",
          !coverUrl && tintFor(venue.name)
        )}
      >
        {coverUrl ? (
          <img src={coverUrl} alt={venue.supplier_name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="p-2.5 text-xs font-semibold md:text-sm">{initials(venue.supplier_name)}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:p-4">
        <b className="truncate text-base md:text-[17px]">{venue.supplier_name}</b>
        {(phoneMeta || desktopMeta) && (
          <>
            <span className="text-[13px] text-muted-foreground md:hidden">{phoneMeta}</span>
            <span className="hidden text-sm text-muted-foreground md:inline">{desktopMeta}</span>
          </>
        )}
        {venue.custom_venue_price_range && (
          <div>
            <Badge variant={priceBadgeVariant(venue.custom_venue_price_range)}>{venue.custom_venue_price_range}</Badge>
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary">{t}</Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

export function VenueCardsSkeleton() {
  return (
    <div className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-4" aria-busy="true" aria-label="Loading venues">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex gap-3 overflow-hidden rounded-2xl border bg-card p-2.5 md:flex-col md:gap-0 md:p-0">
          <div className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-border/60 md:h-[150px] md:w-full md:rounded-none" />
          <div className="flex flex-1 flex-col gap-2 md:p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-border/60" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-border/60" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-border/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
