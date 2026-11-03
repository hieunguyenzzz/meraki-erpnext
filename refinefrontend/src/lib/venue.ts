import type { VenueSupplier, VenueWeddingArea } from "@/lib/types";

export type VenueBadgeVariant = "info" | "success" | "warning" | "destructive" | "outline";

const PRICE_BADGE_VARIANTS: Record<string, VenueBadgeVariant> = {
  LOW: "info",
  MID: "success",
  HIGH: "warning",
  LUXURY: "destructive",
  UNKNOWN: "outline",
};

export function priceBadgeVariant(value: string): VenueBadgeVariant {
  return PRICE_BADGE_VARIANTS[value.toUpperCase()] ?? "outline";
}

/** Smallest and largest guest count across all areas; null when no area has a capacity. */
export function capacityBounds(areas: VenueWeddingArea[]): { min: number | null; max: number | null } | null {
  const mins = areas.map((a) => a.capacity_min).filter((n): n is number => typeof n === "number" && n > 0);
  const maxs = areas.map((a) => a.capacity_max).filter((n): n is number => typeof n === "number" && n > 0);
  if (mins.length === 0 && maxs.length === 0) return null;
  return {
    min: mins.length > 0 ? Math.min(...mins) : null,
    max: maxs.length > 0 ? Math.max(...maxs) : null,
  };
}

/** "60–300 guests", "150 guests" or null. */
export function capacityLabel(areas: VenueWeddingArea[]): string | null {
  const b = capacityBounds(areas);
  if (!b) return null;
  const { min, max } = b;
  if (min !== null && max !== null && min !== max) return `${min}–${max} guests`;
  return `${min ?? max} guests`;
}

/** Listing row from /inquiry-api/venues/listing: a Supplier with its wedding areas. */
export interface VenueRow extends VenueSupplier {
  areas: VenueWeddingArea[];
  cover_url?: string | null;
}
