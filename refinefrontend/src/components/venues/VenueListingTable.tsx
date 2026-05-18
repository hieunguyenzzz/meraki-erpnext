import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { VenueSupplier, VenueWeddingArea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VenueRow extends VenueSupplier {
  areas: VenueWeddingArea[];
}

export interface VenueListingTableProps {
  venues: VenueRow[];
  showCityColumn?: boolean;
  onRowClick?: (venueName: string) => void;
}

// ---------------------------------------------------------------------------
// Internal flat-row shape
// ---------------------------------------------------------------------------

interface FlatRow {
  venue: VenueRow;
  area: VenueWeddingArea | null;
  venueRowIndex: number;
  venueRowCount: number;
}

function flatten(venues: VenueRow[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const v of venues) {
    if (v.areas.length === 0) {
      rows.push({ venue: v, area: null, venueRowIndex: 0, venueRowCount: 1 });
    } else {
      v.areas.forEach((a, i) => {
        rows.push({ venue: v, area: a, venueRowIndex: i, venueRowCount: v.areas.length });
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// LongText helper
// ---------------------------------------------------------------------------

function LongText({ value }: { value?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (value.length < 80 || expanded)
    return <span className="whitespace-pre-wrap">{value}</span>;
  return (
    <span>
      <span className="line-clamp-2 whitespace-pre-wrap">{value}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        className="text-xs text-primary hover:underline"
      >
        more
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Price badge
// ---------------------------------------------------------------------------

const PRICE_BADGE_VARIANTS: Record<string, string> = {
  LOW: "bg-blue-100 text-blue-700",
  MID: "bg-emerald-100 text-emerald-700",
  HIGH: "bg-amber-100 text-amber-700",
  LUXURY: "bg-purple-100 text-purple-700",
  UNKNOWN: "bg-gray-100 text-gray-600",
};

function PriceBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const cls =
    PRICE_BADGE_VARIANTS[value.toUpperCase()] ?? PRICE_BADGE_VARIANTS.UNKNOWN;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

type Scope = "venue" | "area";

interface ColDef {
  id: string;
  header: string;
  scope: Scope;
  width: number;
  cell: (row: FlatRow) => React.ReactNode;
  // sticky: how many pixels from the left edge (undefined = not sticky)
  stickyLeft?: number;
}

function buildColumns(
  showCity: boolean,
  onRowClick?: (name: string) => void
): ColDef[] {
  const cols: ColDef[] = [];

  // Sticky offsets:
  // city: 0px (100px wide)   → only when showCity
  // subarea: 0 or 100px      (120px wide)
  // venue_name: 120 or 220px (220px wide)
  // area_name: 340 or 440px  (180px wide)

  const subareaLeft = showCity ? 100 : 0;
  const venueNameLeft = subareaLeft + 120;
  const areaNameLeft = venueNameLeft + 220;

  if (showCity) {
    cols.push({
      id: "city",
      header: "City",
      scope: "venue",
      width: 100,
      stickyLeft: 0,
      cell: ({ venue }) => (
        <span>{venue.custom_venue_city ?? <span className="text-muted-foreground">—</span>}</span>
      ),
    });
  }

  cols.push(
    {
      id: "subarea",
      header: "Subarea",
      scope: "venue",
      width: 120,
      stickyLeft: subareaLeft,
      cell: ({ venue }) =>
        venue.custom_venue_location_subarea ? (
          <span>{venue.custom_venue_location_subarea}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "type",
      header: "Type",
      scope: "venue",
      width: 140,
      cell: ({ venue }) =>
        venue.custom_venue_type ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
            {venue.custom_venue_type}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "venue_name",
      header: "Venue",
      scope: "venue",
      width: 220,
      stickyLeft: venueNameLeft,
      cell: ({ venue }) => (
        <button
          className="text-left font-medium text-primary hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onRowClick?.(venue.name);
          }}
        >
          {venue.supplier_name}
        </button>
      ),
    },
    {
      id: "price",
      header: "Price",
      scope: "venue",
      width: 100,
      cell: ({ venue }) => <PriceBadge value={venue.custom_venue_price_range} />,
    },
    {
      id: "package",
      header: "Package",
      scope: "venue",
      width: 220,
      cell: ({ venue }) => {
        const text = venue.custom_venue_wedding_package_text;
        const url = venue.custom_venue_wedding_package_url;
        if (!text && !url) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex items-start gap-1">
            <LongText value={text} />
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-primary hover:text-primary/70"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3 mt-0.5" />
              </a>
            )}
          </span>
        );
      },
    },
    {
      id: "insights",
      header: "Insights",
      scope: "venue",
      width: 240,
      cell: ({ venue }) => <LongText value={venue.custom_venue_insights} />,
    }
  );

  cols.push(
    {
      id: "area_name",
      header: "Area",
      scope: "area",
      width: 180,
      stickyLeft: areaNameLeft,
      cell: ({ area }) =>
        area ? (
          <span>{area.area_name}</span>
        ) : (
          <span className="text-muted-foreground italic text-xs">(no areas)</span>
        ),
    },
    {
      id: "area_type",
      header: "Area Type",
      scope: "area",
      width: 130,
      cell: ({ area }) =>
        area?.area_type ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
            {area.area_type}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "function",
      header: "Function",
      scope: "area",
      width: 200,
      cell: ({ area }) => <LongText value={area?.function} />,
    },
    {
      id: "capacity",
      header: "Capacity",
      scope: "area",
      width: 140,
      cell: ({ area }) => {
        if (!area) return <span className="text-muted-foreground">—</span>;
        const { capacity_min, capacity_max, capacity_notes } = area;
        const range =
          capacity_min != null && capacity_max != null
            ? `${capacity_min} – ${capacity_max}`
            : capacity_min != null
            ? `${capacity_min}+`
            : capacity_max != null
            ? `up to ${capacity_max}`
            : null;
        return (
          <span>
            {range ? <span className="font-medium">{range}</span> : <span className="text-muted-foreground">—</span>}
            {capacity_notes && (
              <span className="block text-xs text-muted-foreground leading-tight mt-0.5">
                {capacity_notes}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "policy",
      header: "Policy",
      scope: "area",
      width: 200,
      cell: ({ area }) => <LongText value={area?.policy_min_spend} />,
    },
    {
      id: "setup",
      header: "Setup",
      scope: "area",
      width: 200,
      cell: ({ area }) => <LongText value={area?.setup_notes} />,
    },
    {
      id: "meraki",
      header: "Meraki Weddings",
      scope: "area",
      width: 180,
      cell: ({ area }) => <LongText value={area?.meraki_weddings} />,
    },
    {
      id: "photos",
      header: "Photos",
      scope: "area",
      width: 80,
      cell: ({ area }) =>
        area?.photos_url ? (
          <a
            href={area.photos_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }
  );

  cols.push(
    {
      id: "accommodation",
      header: "Accommodation",
      scope: "venue",
      width: 220,
      cell: ({ venue }) => <LongText value={venue.custom_venue_accommodation} />,
    },
    {
      id: "fnb",
      header: "F&B",
      scope: "venue",
      width: 200,
      cell: ({ venue }) => <LongText value={venue.custom_venue_fnb} />,
    },
    {
      id: "av",
      header: "AV",
      scope: "venue",
      width: 180,
      cell: ({ venue }) => <LongText value={venue.custom_venue_av_policy} />,
    },
    {
      id: "facility",
      header: "Facility",
      scope: "venue",
      width: 180,
      cell: ({ venue }) => <LongText value={venue.custom_venue_facility} />,
    },
    {
      id: "after_party",
      header: "After Party",
      scope: "venue",
      width: 160,
      cell: ({ venue }) => <LongText value={venue.custom_venue_after_party} />,
    },
    {
      id: "contact",
      header: "Address & Contact",
      scope: "venue",
      width: 240,
      cell: ({ venue }) => <LongText value={venue.custom_venue_contact_raw} />,
    }
  );

  return cols;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VenueListingTable({
  venues,
  showCityColumn = false,
  onRowClick,
}: VenueListingTableProps) {
  if (venues.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-12 text-center">
        No venues match this filter.
      </div>
    );
  }

  const rows = flatten(venues);
  const columns = buildColumns(showCityColumn, onRowClick);

  return (
    <div className="w-full overflow-x-auto border rounded-md">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            {columns.map((col) => {
              const isSticky = col.stickyLeft !== undefined;
              return (
                <th
                  key={col.id}
                  style={{
                    minWidth: col.width,
                    width: col.width,
                    ...(isSticky ? { left: col.stickyLeft } : {}),
                  }}
                  className={[
                    "px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                    "sticky top-0 z-20 bg-background border-b border-border",
                    isSticky
                      ? "z-30 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="hover:bg-muted/30"
            >
              {columns.map((col) => {
                const isVenueScope = col.scope === "venue";
                // Skip venue-scoped cells on non-first rows of the group
                if (isVenueScope && row.venueRowIndex > 0) return null;

                const rowSpan = isVenueScope ? row.venueRowCount : undefined;
                const isSticky = col.stickyLeft !== undefined;

                return (
                  <td
                    key={col.id}
                    rowSpan={rowSpan}
                    style={{
                      minWidth: col.width,
                      width: col.width,
                      ...(isSticky ? { left: col.stickyLeft } : {}),
                    }}
                    className={[
                      "px-3 py-2 align-top border-b border-border",
                      isSticky
                        ? "sticky z-10 bg-background after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border"
                        : "",
                      // Subtle top border to visually separate venue groups when
                      // this is the first row of a new venue (for area-scoped cells,
                      // the venue-scoped cells already provide the visual anchor)
                      row.venueRowIndex === 0 ? "border-t border-t-border/60" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.cell(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
