import { useMemo } from "react";
import { MapPin, Users, CalendarDays, ExternalLink } from "lucide-react";
import type { VenueSupplier, VenueWeddingArea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VenueDetailHeroProps {
  venue: VenueSupplier;
  areas: VenueWeddingArea[];
  coverPhotoUrl?: string | null;
  weddingsCount: number;
  driveLinkUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VenueDetailHero({
  venue,
  areas,
  coverPhotoUrl,
  weddingsCount,
  driveLinkUrl,
}: VenueDetailHeroProps) {
  const capacityPill = useMemo(() => {
    const mins = areas
      .map((a) => a.capacity_min)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const maxs = areas
      .map((a) => a.capacity_max)
      .filter((v): v is number => typeof v === "number" && v > 0);

    const min = mins.length > 0 ? Math.min(...mins) : null;
    const max = maxs.length > 0 ? Math.max(...maxs) : null;

    if (min === null && max === null) return null;

    const val = min !== null && max !== null && min !== max
      ? `${min}–${max} pax`
      : min !== null
      ? `${min} pax`
      : `${max} pax`;

    return `Capacity ${val}`;
  }, [areas]);

  return (
    <div className="relative h-[280px] w-full overflow-hidden rounded-lg">
      {/* Background: photo or gradient */}
      {coverPhotoUrl ? (
        <>
          <img
            src={coverPhotoUrl}
            alt={venue.supplier_name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#C9A9A6] to-[#C4A962] flex items-center justify-center">
          <span className="text-7xl font-bold text-white/60 select-none">
            {getInitials(venue.supplier_name)}
          </span>
        </div>
      )}

      {/* Stat pills — bottom-left */}
      <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
        {/* Pill 1: areas count */}
        <div className="bg-background/90 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm font-medium shadow-sm">
          <MapPin className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
          {areas.length} area{areas.length === 1 ? "" : "s"}
        </div>

        {/* Pill 2: capacity (conditional) */}
        {capacityPill && (
          <div className="bg-background/90 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm font-medium shadow-sm">
            <Users className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
            {capacityPill}
          </div>
        )}

        {/* Pill 3: weddings count */}
        <div className="bg-background/90 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm font-medium shadow-sm">
          <CalendarDays className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
          {weddingsCount} wedding{weddingsCount === 1 ? "" : "s"}
        </div>
      </div>

      {/* View Drive link — bottom-right (conditional) */}
      {driveLinkUrl && (
        <a
          href={driveLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 right-4 bg-background/90 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-background flex items-center gap-1.5"
        >
          View Drive
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
