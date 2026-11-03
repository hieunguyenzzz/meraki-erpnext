import type { VenueSupplier, VenueWeddingArea } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { capacityLabel, priceBadgeVariant } from "@/lib/venue";

interface Props {
  venue: VenueSupplier;
  areas: VenueWeddingArea[];
  weddingsCount: number;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-base font-semibold">{children}</span>
    </div>
  );
}

const NONE = <span className="font-normal text-muted-foreground">—</span>;

/** Location, capacity, price tier and wedding count at a glance. */
export function VenueKeyFacts({ venue, areas, weddingsCount }: Props) {
  const location = [venue.custom_venue_location_subarea, venue.custom_venue_city].filter(Boolean).join(", ");
  const capacity = capacityLabel(areas);
  const price = venue.custom_venue_price_range;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Fact label="Location">{location || NONE}</Fact>
      <Fact label="Capacity">{capacity ?? NONE}</Fact>
      <Fact label="Price range">
        {price ? <Badge variant={priceBadgeVariant(price)}>{price}</Badge> : NONE}
      </Fact>
      <Fact label="Weddings with us">{weddingsCount}</Fact>
    </div>
  );
}
