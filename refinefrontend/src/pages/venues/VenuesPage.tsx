import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  VenueListingTable,
  type VenueRow,
} from "@/components/venues/VenueListingTable";
import { VenueForm } from "@/components/venues/VenueForm";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { key: "all", label: "All cities" },
  { key: "hcm", label: "HCM", city: "HCM" },
  { key: "phu-quoc", label: "Phú Quốc", city: "Phú Quốc" },
  { key: "da-nang", label: "Đà Nẵng", city: "Đà Nẵng" },
  { key: "hoi-an", label: "Hội An", city: "Hội An" },
  { key: "da-lat", label: "Đà Lạt", city: "Đà Lạt" },
  { key: "vung-tau", label: "Vũng Tàu", city: "Vũng Tàu" },
  { key: "nha-trang", label: "Nha Trang", city: "Nha Trang" },
  { key: "hue", label: "Huế", city: "Huế" },
  { key: "ha-noi", label: "Hà Nội", city: "Hà Nội" },
  { key: "ha-long", label: "Hạ Long", city: "Hạ Long" },
  { key: "ninh-binh", label: "Ninh Bình", city: "Ninh Bình" },
  { key: "sapa", label: "Sapa", city: "Sapa" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VenuesPage() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  // URL state
  const [tabKey, setTabKey] = useQueryState("tab", { defaultValue: "all" });
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [typeFilter, setTypeFilter] = useQueryState("type", { defaultValue: "" });
  const [priceFilter, setPriceFilter] = useQueryState("price", { defaultValue: "" });

  // Fetch all venues once
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["venues-listing"],
    queryFn: async () => {
      const res = await fetch("/inquiry-api/venues/listing", { credentials: "include" });
      if (!res.ok) throw new Error(`Listing failed: ${res.status}`);
      return res.json() as Promise<{ venues: VenueRow[] }>;
    },
  });

  const allVenues = useMemo(() => data?.venues ?? [], [data]);

  // Counts per tab
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: allVenues.length };
    for (const v of allVenues) {
      if (v.custom_venue_city) {
        const tab = TABS.find((t) => "city" in t && t.city === v.custom_venue_city);
        if (tab) map[tab.key] = (map[tab.key] ?? 0) + 1;
      }
    }
    return map;
  }, [allVenues]);

  // Type options derived from data
  const typeOptions = useMemo(() => {
    const types = [...new Set(allVenues.map((v) => v.custom_venue_type).filter(Boolean))].sort() as string[];
    return types;
  }, [allVenues]);

  // Filtered venues
  const filtered = useMemo(() => {
    const activeCity = TABS.find((t) => t.key === tabKey);
    const activeTabCity = activeCity && "city" in activeCity ? activeCity.city : undefined;
    const s = search.toLowerCase();
    return allVenues.filter((v) => {
      if (activeTabCity && v.custom_venue_city !== activeTabCity) return false;
      if (typeFilter && typeFilter !== "__all__" && v.custom_venue_type !== typeFilter) return false;
      if (priceFilter && priceFilter !== "__all__" && v.custom_venue_price_range !== priceFilter) return false;
      if (s) {
        const hay = [v.supplier_name, v.custom_venue_location_subarea, v.custom_venue_insights]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allVenues, tabKey, search, typeFilter, priceFilter]);

  const showCityColumn = tabKey === "all";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Venues</h1>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Venue
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b gap-0 -mx-0">
          {TABS.map((tab) => {
            const count = counts[tab.key] ?? 0;
            const isActive = tabKey === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTabKey(tab.key)}
                className={[
                  "shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  "border-b-2 -mb-px",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                ].join(" ")}
              >
                {tab.label}
                <span
                  className={[
                    "text-xs px-1.5 py-0.5 rounded-full font-normal",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 flex gap-3 flex-wrap items-center shrink-0 border-b">
        <Input
          placeholder="Search venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={typeFilter || "__all__"}
          onValueChange={(v) => setTypeFilter(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All types</SelectItem>
            {typeOptions.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priceFilter || "__all__"}
          onValueChange={(v) => setPriceFilter(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All prices" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All prices</SelectItem>
            {(["LOW", "MID", "HIGH", "LUXURY", "UNKNOWN"] as const).map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table area */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm py-12 text-center">
            Loading venues...
          </div>
        ) : isError ? (
          <div className="text-destructive text-sm py-12 text-center">
            Failed to load venues.{" "}
            <button
              onClick={() => refetch()}
              className="underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <VenueListingTable
            venues={filtered}
            showCityColumn={showCityColumn}
            onRowClick={(name) => navigate(`/venues/${name}`)}
          />
        )}
      </div>

      {/* Add Venue Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Add Venue</SheetTitle>
          </SheetHeader>
          <VenueForm
            mode="create"
            onSaved={(name) => {
              setAddOpen(false);
              refetch();
              navigate(`/venues/${name}`);
            }}
            onCancel={() => setAddOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
