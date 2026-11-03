import { ExternalLink } from "lucide-react";
import type { VenueSupplier } from "@/lib/types";
import { cn } from "@/lib/utils";

interface VenueDetailHeroProps {
  venue: VenueSupplier;
  coverPhotoUrl?: string | null;
  /** All image URLs attached to the venue (cover included). */
  photoUrls: string[];
  driveLinkUrl?: string | null;
  onSeeAll: () => void;
}

const FILLERS = ["bg-success-soft", "bg-info-soft", "bg-accent"];

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** Photo mosaic: cover plus up to three more photos; tinted tiles stand in where photos are missing. */
export function VenueDetailHero({ venue, coverPhotoUrl, photoUrls, driveLinkUrl, onSeeAll }: VenueDetailHeroProps) {
  const cover = coverPhotoUrl ?? photoUrls[0] ?? null;
  const others = photoUrls.filter((u) => u !== cover).slice(0, 3);
  const remaining = Math.max(0, photoUrls.length - 1 - others.length);

  const drive = driveLinkUrl && (
    <a
      href={driveLinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute bottom-3 left-3 flex h-10 items-center gap-1.5 rounded-full bg-background/90 px-3.5 text-sm font-semibold shadow-sm backdrop-blur-sm hover:bg-background"
    >
      View Drive
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );

  if (!cover) {
    return (
      <div className="relative flex h-[200px] items-center justify-center overflow-hidden rounded-2xl bg-success-soft md:h-[310px]">
        <span className="select-none font-display text-7xl font-semibold text-success-soft-foreground/60">
          {initials(venue.supplier_name)}
        </span>
        {drive}
      </div>
    );
  }

  return (
    <div className="relative grid h-[200px] grid-cols-1 gap-2.5 md:h-[310px] md:grid-cols-4 md:grid-rows-2">
      <div className="overflow-hidden rounded-2xl bg-muted md:col-span-2 md:row-span-2">
        <img src={cover} alt={venue.supplier_name} className="h-full w-full object-cover" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("hidden overflow-hidden rounded-2xl md:block", !others[i] && FILLERS[i])}>
          {others[i] && <img src={others[i]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
        </div>
      ))}
      <button
        type="button"
        onClick={onSeeAll}
        className="h-10 rounded-full bg-foreground px-4 text-sm font-semibold text-background max-md:absolute max-md:bottom-3 max-md:right-3 md:h-auto md:rounded-2xl md:text-[15px]"
      >
        <span className="md:hidden">{photoUrls.length} photos</span>
        <span className="max-md:hidden">{remaining > 0 ? `+ ${remaining} photos` : "All photos"}</span>
      </button>
      {drive}
    </div>
  );
}
