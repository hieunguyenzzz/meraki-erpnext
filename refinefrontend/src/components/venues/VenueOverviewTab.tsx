import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VenueSupplier } from "@/lib/types";

interface VenueOverviewTabProps {
  venue: VenueSupplier;
}

export function VenueOverviewTab({ venue }: VenueOverviewTabProps) {
  const hasInsights = Boolean(venue.custom_venue_insights?.trim());
  const hasPackageText = Boolean(venue.custom_venue_wedding_package_text?.trim());
  const hasPackageUrl = Boolean(venue.custom_venue_wedding_package_url?.trim());
  const hasPackage = hasPackageText || hasPackageUrl;

  return (
    <div className="space-y-4">
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Left — Insights */}
        <Card>
          <CardHeader>
            <CardTitle>Insights</CardTitle>
          </CardHeader>
          <CardContent>
            {hasInsights ? (
              <p className="whitespace-pre-wrap text-sm">
                {venue.custom_venue_insights}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No insights captured yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right — Wedding Package */}
        <Card>
          <CardHeader>
            <CardTitle>Wedding Package</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasPackage ? (
              <>
                {hasPackageText && (
                  <p className="whitespace-pre-wrap text-sm">
                    {venue.custom_venue_wedding_package_text}
                  </p>
                )}
                {hasPackageUrl && (
                  <a
                    href={venue.custom_venue_wedding_package_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    Open package{" "}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No package details yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {venue.custom_venue_source && (
        <p className="text-xs text-muted-foreground">
          Imported from: {venue.custom_venue_source}
        </p>
      )}
    </div>
  );
}
