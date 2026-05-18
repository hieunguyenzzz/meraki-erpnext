import {
  BedDouble,
  Utensils,
  Music,
  Sparkles,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VenueSupplier } from "@/lib/types";

interface VenueAmenitiesTabProps {
  venue: VenueSupplier;
}

interface AmenitySection {
  field: keyof VenueSupplier;
  label: string;
  icon: LucideIcon;
}

const AMENITY_SECTIONS: AmenitySection[] = [
  { field: "custom_venue_accommodation", label: "Accommodation", icon: BedDouble },
  { field: "custom_venue_fnb",           label: "F&B",            icon: Utensils },
  { field: "custom_venue_av_policy",     label: "AV / Policy",    icon: Music },
  { field: "custom_venue_facility",      label: "Facility",       icon: Sparkles },
  { field: "custom_venue_after_party",   label: "After Party",    icon: PartyPopper },
];

export function VenueAmenitiesTab({ venue }: VenueAmenitiesTabProps) {
  const activeSections = AMENITY_SECTIONS.filter(({ field }) => {
    const val = venue[field];
    return typeof val === "string" && val.trim().length > 0;
  });

  if (activeSections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No amenities recorded yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {activeSections.map(({ field, label, icon: Icon }) => (
        <Card key={field}>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {venue[field] as string}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
