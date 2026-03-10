import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { useList, useCreate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertCircle, Plus, MapPin, Users, DollarSign } from "lucide-react";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function VenuesPage() {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("__all__");

  // Add venue form state
  const [formName, setFormName] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formCapacityMin, setFormCapacityMin] = useState("");
  const [formCapacityMax, setFormCapacityMax] = useState("");
  const [formPriceRange, setFormPriceRange] = useState("");
  const [formContact, setFormContact] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch all venues
  const { result: venuesResult, query: venuesQuery } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    filters: [{ field: "supplier_group", operator: "eq", value: "Wedding Venues" }],
    meta: {
      fields: [
        "name",
        "supplier_name",
        "custom_venue_city",
      ],
    },
  });
  const venues = venuesResult?.data ?? [];

  // Batch fetch cover images
  const venueNames = useMemo(() => venues.map((v: any) => v.name), [venues]);

  const { result: filesResult } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [
      { field: "attached_to_doctype", operator: "eq", value: "Supplier" },
      { field: "attached_to_name", operator: "in", value: venueNames },
    ],
    meta: { fields: ["name", "file_url", "attached_to_name"] },
    queryOptions: { enabled: venueNames.length > 0 },
  });

  const coverImages = useMemo(() => {
    const files = filesResult?.data ?? [];
    const map: Record<string, string> = {};
    for (const f of files) {
      if (!map[f.attached_to_name] && /\.(jpg|jpeg|png|webp)$/i.test(f.file_url)) {
        map[f.attached_to_name] = f.file_url;
      }
    }
    return map;
  }, [filesResult]);

  // Client-side filtering
  const cities = useMemo(
    () =>
      [...new Set(venues.map((v: any) => v.custom_venue_city).filter(Boolean))].sort() as string[],
    [venues]
  );

  const filtered = useMemo(
    () =>
      venues.filter((v: any) => {
        const nameMatch = v.supplier_name.toLowerCase().includes(search.toLowerCase());
        const cityMatch = cityFilter === "__all__" || v.custom_venue_city === cityFilter;
        return nameMatch && cityMatch;
      }),
    [venues, search, cityFilter]
  );

  const { mutate: createVenue } = useCreate();
  const [creating, setCreating] = useState(false);

  function resetForm() {
    setFormName("");
    setFormCity("");
    setFormLocation("");
    setFormCapacityMin("");
    setFormCapacityMax("");
    setFormPriceRange("");
    setFormContact("");
    setCreateError(null);
  }

  function handleSubmit() {
    if (!formName.trim()) {
      setCreateError("Venue name is required.");
      return;
    }
    setCreateError(null);
    setCreating(true);
    createVenue(
      {
        resource: "Supplier",
        values: {
          supplier_name: formName.trim(),
          supplier_group: "Wedding Venues",
          supplier_type: "Company",
          country: "Vietnam",
          custom_venue_city: formCity || undefined,
          custom_location: formLocation || undefined,
          custom_capacity_min: formCapacityMin ? Number(formCapacityMin) : undefined,
          custom_capacity_max: formCapacityMax ? Number(formCapacityMax) : undefined,
          custom_price_range: formPriceRange || undefined,
          custom_contact_person: formContact || undefined,
        },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: (data) => {
          setCreating(false);
          setSheetOpen(false);
          resetForm();
          navigate(`/venues/${data.data.name}`);
        },
        onError: (err: any) => {
          setCreating(false);
          setCreateError(err?.message ?? "Failed to create venue.");
        },
      }
    );
  }

  const isLoading = venuesQuery.isLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Venues</h1>
        <Button onClick={() => { resetForm(); setSheetOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Venue
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Cities</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-muted-foreground text-sm">Loading venues...</div>
      )}

      {/* Grid */}
      {!isLoading && (
        <>
          {filtered.length === 0 ? (
            <div className="text-muted-foreground text-sm py-12 text-center">
              No venues found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((v: any) => {
                const coverUrl = coverImages[v.name];
                const initials = getInitials(v.supplier_name);
                return (
                  <div
                    key={v.name}
                    className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/venues/${v.name}`)}
                  >
                    {/* Photo or placeholder */}
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={v.supplier_name}
                        className="w-full h-40 object-cover"
                      />
                    ) : (
                      <div className="w-full h-40 bg-gradient-to-br from-[#C9A9A6]/30 to-[#C4A962]/20 flex items-center justify-center">
                        <span className="text-4xl font-bold text-[#C9A9A6]/70 select-none">
                          {initials}
                        </span>
                      </div>
                    )}

                    {/* Card body */}
                    <div className="p-4 space-y-1.5">
                      <p className="font-semibold text-base leading-tight">{v.supplier_name}</p>
                      {v.custom_venue_city && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {v.custom_venue_city}
                        </p>
                      )}
                      {(Number(v.custom_capacity_min) > 0 || Number(v.custom_capacity_max) > 0) && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          {v.custom_capacity_min && v.custom_capacity_max
                            ? `${v.custom_capacity_min} – ${v.custom_capacity_max}`
                            : v.custom_capacity_min || v.custom_capacity_max}
                        </p>
                      )}
                      {v.custom_price_range && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 shrink-0" />
                          {v.custom_price_range}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add Venue Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Add Venue</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {createError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm">{createError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="add-name">
                Venue Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Grand Palace Hotel"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-city">City</Label>
              <Input
                id="add-city"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                placeholder="e.g. Ho Chi Minh City"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-location">Location</Label>
              <Input
                id="add-location"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="e.g. 123 Nguyen Hue, District 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-cap-min">Capacity Min</Label>
                <Input
                  id="add-cap-min"
                  type="number"
                  value={formCapacityMin}
                  onChange={(e) => setFormCapacityMin(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-cap-max">Capacity Max</Label>
                <Input
                  id="add-cap-max"
                  type="number"
                  value={formCapacityMax}
                  onChange={(e) => setFormCapacityMax(e.target.value)}
                  placeholder="e.g. 500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-price">Price Range</Label>
              <Input
                id="add-price"
                value={formPriceRange}
                onChange={(e) => setFormPriceRange(e.target.value)}
                placeholder="e.g. 50,000,000 – 200,000,000 đ"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-contact">Contact Person</Label>
              <Input
                id="add-contact"
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
                placeholder="e.g. Nguyen Van A"
              />
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={creating}>
              {creating ? "Creating..." : "Create Venue"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
