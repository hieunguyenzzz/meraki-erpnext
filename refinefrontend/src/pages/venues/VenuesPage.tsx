import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VenueForm } from "@/components/venues/VenueForm";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";
import type { VenueRow } from "@/lib/venue";
import { CITY_TABS } from "./venues-list/cities";
import { VenueCard, VenueCardsSkeleton } from "./venues-list/VenueCard";
import { VenuesFilterBar } from "./venues-list/VenuesFilterBar";

export default function VenuesPage() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  // URL state
  const [tabKey, setTabKey] = useQueryState("tab", { defaultValue: "all" });
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [typeFilter, setTypeFilter] = useQueryState("type", { defaultValue: "" });
  const [priceFilter, setPriceFilter] = useQueryState("price", { defaultValue: "" });

  // Fetch all venues once
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["venues-listing"],
    queryFn: async () => {
      const res = await fetch("/inquiry-api/venues/listing", { credentials: "include" });
      if (!res.ok) throw new Error(`Listing failed: ${res.status}`);
      return res.json() as Promise<{ venues: VenueRow[] }>;
    },
  });
  if (isError) console.error("Venues listing failed", error);

  const allVenues = useMemo(() => data?.venues ?? [], [data]);

  // Counts per tab
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: allVenues.length };
    for (const v of allVenues) {
      if (v.custom_venue_city) {
        const tab = CITY_TABS.find((t) => "city" in t && t.city === v.custom_venue_city);
        if (tab) map[tab.key] = (map[tab.key] ?? 0) + 1;
      }
    }
    return map;
  }, [allVenues]);

  // Type options derived from data
  const typeOptions = useMemo(
    () => [...new Set(allVenues.map((v) => v.custom_venue_type).filter(Boolean))].sort() as string[],
    [allVenues]
  );

  // Filtered venues
  const filtered = useMemo(() => {
    const activeCity = CITY_TABS.find((t) => t.key === tabKey);
    const activeTabCity = activeCity && "city" in activeCity ? activeCity.city : undefined;
    const s = search.toLowerCase();
    return allVenues.filter((v) => {
      if (activeTabCity && v.custom_venue_city !== activeTabCity) return false;
      if (typeFilter && v.custom_venue_type !== typeFilter) return false;
      if (priceFilter && v.custom_venue_price_range !== priceFilter) return false;
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

  const isFiltered = tabKey !== "all" || !!search || !!typeFilter || !!priceFilter;

  let body;
  if (isError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load venues"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => void refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (isLoading) {
    body = <VenueCardsSkeleton />;
  } else if (filtered.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={isFiltered ? "No venues match" : "No venues yet"}
        text={isFiltered ? "Try a different city, type or search." : "Add the first venue to start building the list."}
        action={isFiltered ? undefined : { label: "Add venue", onClick: () => setAddOpen(true) }}
      />
    );
  } else {
    body = (
      <>
        <span className="px-1 text-[13px] text-muted-foreground md:text-sm">
          {filtered.length} venue{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-4">
          {filtered.map((v) => (
            <VenueCard
              key={v.name}
              venue={v}
              showCity={tabKey === "all"}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Venues</h1>
        <Button onClick={() => setAddOpen(true)} className="shrink-0" aria-label="Add venue">
          <Plus className="h-4 w-4" />
          <span className="md:hidden">Venue</span>
          <span className="max-md:hidden">Add venue</span>
        </Button>
      </header>

      <VenuesFilterBar
        search={search}
        onSearch={setSearch}
        type={typeFilter}
        onType={setTypeFilter}
        typeOptions={typeOptions}
        price={priceFilter}
        onPrice={setPriceFilter}
        city={tabKey}
        onCity={setTabKey}
        counts={counts}
      />

      {body}

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
              void refetch();
              navigate(`/venues/${encodeURIComponent(name)}`);
            }}
            onCancel={() => setAddOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
