import { Link } from "react-router";
import { Globe, Mail, Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { telHref } from "@/lib/phone";
import { initials, tintFor, websiteHref, type VendorRow } from "@/lib/vendor";

const linkCls = "relative z-10 -my-2 inline-flex min-h-[44px] items-center gap-1.5 truncate text-primary hover:underline md:my-0 md:min-h-0";

/** Photo card: stacked on desktop (grid), thumbnail-left row on phones. The name link covers the card; contact links sit above it. */
export function VendorCard({ vendor, coverUrl }: { vendor: VendorRow; coverUrl?: string }) {
  const tel = telHref(vendor.custom_contact_phone);
  return (
    <div className="relative flex gap-3 overflow-hidden rounded-2xl border bg-card p-2.5 text-card-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md md:flex-col md:gap-0 md:p-0">
      <div className={cn("flex h-24 w-24 shrink-0 items-end overflow-hidden rounded-xl md:h-[150px] md:w-full md:rounded-none", !coverUrl && tintFor(vendor.name))}>
        {coverUrl ? (
          <img src={coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="p-2.5 text-xs font-semibold md:text-sm">{initials(vendor.supplier_name)}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:p-4">
        <Link
          to={`/vendors/${encodeURIComponent(vendor.name)}`}
          className="truncate text-base font-bold after:absolute after:inset-0 focus-visible:outline-none md:text-[17px]"
        >
          {vendor.supplier_name}
        </Link>
        {vendor.custom_vendor_category && (
          <div>
            <Badge variant="secondary">{vendor.custom_vendor_category}</Badge>
          </div>
        )}
        {vendor.custom_contact_person && (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground md:text-sm">
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{vendor.custom_contact_person}</span>
          </span>
        )}
        {vendor.custom_contact_phone && (
          <div className="text-[13px] md:text-sm">
            {tel ? (
              <a href={tel} className={linkCls}>
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {vendor.custom_contact_phone}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {vendor.custom_contact_phone}
              </span>
            )}
          </div>
        )}
        {vendor.custom_contact_email && (
          <div className="text-[13px] md:text-sm">
            <a href={`mailto:${vendor.custom_contact_email}`} className={linkCls}>
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{vendor.custom_contact_email}</span>
            </a>
          </div>
        )}
        {vendor.website && (
          <div className="text-[13px] md:text-sm">
            <a href={websiteHref(vendor.website)} target="_blank" rel="noopener noreferrer" className={linkCls}>
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{vendor.website}</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function VendorCardsSkeleton() {
  return (
    <div className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-4" aria-busy="true" aria-label="Loading vendors">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex gap-3 overflow-hidden rounded-2xl border bg-card p-2.5 md:flex-col md:gap-0 md:p-0">
          <div className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-border/60 md:h-[150px] md:w-full md:rounded-none" />
          <div className="flex flex-1 flex-col gap-2 md:p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-border/60" />
            <div className="h-5 w-24 animate-pulse rounded-full bg-border/60" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-border/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
