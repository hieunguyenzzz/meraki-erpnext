import { useState, useRef, useEffect, useCallback } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VenueAreasEditor } from "@/components/venues/VenueAreasEditor";
import type { VenueSupplier, VenueWeddingArea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VenueFormMode = "create" | "edit";

export interface ContactInitialValue {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  alt_phone?: string;
}

export interface VenueFormProps {
  mode: VenueFormMode;
  initialValue?: Partial<VenueSupplier> & { areas?: VenueWeddingArea[] };
  contactInitialValue?: ContactInitialValue;
  onSaved: (savedName: string) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRICE_RANGE_OPTIONS = ["LOW", "MID", "HIGH", "LUXURY", "UNKNOWN"] as const;
const PRICE_RANGE_NONE = "__none__" as const;

const SECTIONS = [
  { id: "identity", label: "Identity" },
  { id: "pricing", label: "Pricing" },
  { id: "package", label: "Package" },
  { id: "insights", label: "Insights" },
  { id: "amenities", label: "Amenities" },
  { id: "contact", label: "Contact" },
  { id: "areas", label: "Areas" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface FormErrors {
  supplier_name?: string;
  package_url?: string;
  contact_email?: string;
  areas_general?: string;
  areas?: Record<number, Partial<Record<keyof VenueWeddingArea, string>>>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VenueForm({
  mode,
  initialValue,
  contactInitialValue,
  onSaved,
  onCancel,
}: VenueFormProps) {
  // --- Venue fields ---
  const [supplierName, setSupplierName] = useState(initialValue?.supplier_name ?? "");
  const [city, setCity] = useState(initialValue?.custom_venue_city ?? "");
  const [subarea, setSubarea] = useState(initialValue?.custom_venue_location_subarea ?? "");
  const [venueType, setVenueType] = useState(initialValue?.custom_venue_type ?? "");
  const [priceRange, setPriceRange] = useState<string>(
    initialValue?.custom_venue_price_range ?? PRICE_RANGE_NONE,
  );
  const [packageText, setPackageText] = useState(initialValue?.custom_venue_wedding_package_text ?? "");
  const [packageUrl, setPackageUrl] = useState(initialValue?.custom_venue_wedding_package_url ?? "");
  const [insights, setInsights] = useState(initialValue?.custom_venue_insights ?? "");
  const [accommodation, setAccommodation] = useState(initialValue?.custom_venue_accommodation ?? "");
  const [fnb, setFnb] = useState(initialValue?.custom_venue_fnb ?? "");
  const [avPolicy, setAvPolicy] = useState(initialValue?.custom_venue_av_policy ?? "");
  const [facility, setFacility] = useState(initialValue?.custom_venue_facility ?? "");
  const [afterParty, setAfterParty] = useState(initialValue?.custom_venue_after_party ?? "");
  const [contactRaw, setContactRaw] = useState(initialValue?.custom_venue_contact_raw ?? "");

  // --- Contact fields ---
  const [contactName, setContactName] = useState(contactInitialValue?.name ?? "");
  const [contactTitle, setContactTitle] = useState(contactInitialValue?.title ?? "");
  const [contactEmail, setContactEmail] = useState(contactInitialValue?.email ?? "");
  const [contactPhone, setContactPhone] = useState(contactInitialValue?.phone ?? "");
  const [contactAltPhone, setContactAltPhone] = useState(contactInitialValue?.alt_phone ?? "");

  // --- Areas ---
  const [areas, setAreas] = useState<VenueWeddingArea[]>(
    initialValue?.areas ?? [],
  );

  // --- UI state ---
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [backendError, setBackendError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("identity");

  // Section refs for scroll-spy
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observers: IntersectionObserver[] = [];

    SECTIONS.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(id as SectionId);
          }
        },
        { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  function scrollToSection(id: SectionId) {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  }

  // --- Validation ---
  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (!supplierName.trim()) {
      errs.supplier_name = "Venue name is required.";
    }

    if (packageUrl && !isHttpUrl(packageUrl)) {
      errs.package_url = "Must be a valid http/https URL.";
    }

    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      errs.contact_email = "Must be a valid email address.";
    }

    if (areas.length === 0) {
      errs.areas_general = "At least one area is required.";
    }

    const areaErrs: Record<number, Partial<Record<keyof VenueWeddingArea, string>>> = {};
    areas.forEach((area, idx) => {
      const fieldErrs: Partial<Record<keyof VenueWeddingArea, string>> = {};
      if (!area.area_name?.trim()) {
        fieldErrs.area_name = "Area name is required.";
      }
      if (area.photos_url && !isHttpUrl(area.photos_url)) {
        fieldErrs.photos_url = "Must be a valid http/https URL.";
      }
      if (Object.keys(fieldErrs).length > 0) {
        areaErrs[idx] = fieldErrs;
      }
    });
    if (Object.keys(areaErrs).length > 0) {
      errs.areas = areaErrs;
    }

    return errs;
  }

  // --- Save ---
  const handleSave = useCallback(async () => {
    setBackendError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Scroll to first error section
      if (errs.supplier_name) scrollToSection("identity");
      else if (errs.package_url) scrollToSection("package");
      else if (errs.contact_email) scrollToSection("contact");
      else if (errs.areas_general || errs.areas) scrollToSection("areas");
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      // Strip _clientId from areas
      const cleanAreas = areas.map(({ ...rest }) => {
        const { _clientId, ...area } = rest as VenueWeddingArea & { _clientId?: string };
        void _clientId;
        return area;
      });

      const payload: Record<string, unknown> = {
        supplier_name: supplierName.trim(),
        custom_venue_city: city,
        custom_venue_location_subarea: subarea,
        custom_venue_type: venueType,
        custom_venue_price_range: priceRange === PRICE_RANGE_NONE ? "" : priceRange,
        custom_venue_wedding_package_text: packageText,
        custom_venue_wedding_package_url: packageUrl,
        custom_venue_insights: insights,
        custom_venue_accommodation: accommodation,
        custom_venue_fnb: fnb,
        custom_venue_av_policy: avPolicy,
        custom_venue_facility: facility,
        custom_venue_after_party: afterParty,
        custom_venue_contact_raw: contactRaw,
        areas: cleanAreas,
        contact:
          contactName || contactEmail || contactPhone || contactAltPhone || contactTitle
            ? {
                name: contactName,
                title: contactTitle,
                email: contactEmail,
                phone: contactPhone,
                alt_phone: contactAltPhone,
              }
            : null,
      };

      const url =
        mode === "create"
          ? "/inquiry-api/venues/"
          : `/inquiry-api/venues/${encodeURIComponent(initialValue!.name!)}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Save failed: ${res.status}`);
      }

      const data = await res.json();
      onSaved(data.name as string);
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    supplierName, city, subarea, venueType, priceRange,
    packageText, packageUrl, insights, accommodation, fnb,
    avPolicy, facility, afterParty, contactRaw,
    contactName, contactTitle, contactEmail, contactPhone, contactAltPhone,
    areas, mode, initialValue,
  ]);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Body: left rail + scrollable form */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail nav */}
        <nav className="hidden md:flex flex-col gap-1 w-36 shrink-0 px-3 py-4 border-r bg-muted/30">
          {SECTIONS.map(({ id, label }) => {
            const isActive = activeSection === id;
            const isAreas = id === "areas";
            return (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id as SectionId)}
                className={`text-left text-sm px-2 py-1.5 rounded transition-colors w-full flex items-center gap-1.5 ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span>{label}</span>
                {isAreas && areas.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 leading-none ml-auto">
                    {areas.length}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* Scrollable form */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
          {/* Error banner */}
          {(hasErrors || backendError) && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-sm">
                {backendError ?? "Please fix the highlighted fields."}
              </span>
            </div>
          )}

          {/* Identity */}
          <section
            ref={(el) => { sectionRefs.current["identity"] = el; }}
            id="section-identity"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Identity
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="vf-supplier-name">
                  Venue Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="vf-supplier-name"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className={errors.supplier_name ? "border-destructive" : ""}
                />
                {errors.supplier_name && (
                  <p className="text-xs text-destructive">{errors.supplier_name}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vf-city">City</Label>
                  <Input
                    id="vf-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Ho Chi Minh City"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vf-subarea">Subarea</Label>
                  <Input
                    id="vf-subarea"
                    value={subarea}
                    onChange={(e) => setSubarea(e.target.value)}
                    placeholder="e.g. District 1"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section
            ref={(el) => { sectionRefs.current["pricing"] = el; }}
            id="section-pricing"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Pricing
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vf-venue-type">Venue Type</Label>
                <Input
                  id="vf-venue-type"
                  value={venueType}
                  onChange={(e) => setVenueType(e.target.value)}
                  placeholder="e.g. Rooftop, Garden"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-price-range">Price Range</Label>
                <Select
                  value={priceRange}
                  onValueChange={setPriceRange}
                >
                  <SelectTrigger id="vf-price-range">
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PRICE_RANGE_NONE}>— None —</SelectItem>
                    {PRICE_RANGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Package */}
          <section
            ref={(el) => { sectionRefs.current["package"] = el; }}
            id="section-package"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Package
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="vf-package-text">Wedding Package</Label>
                <Textarea
                  id="vf-package-text"
                  rows={3}
                  value={packageText}
                  onChange={(e) => setPackageText(e.target.value)}
                  placeholder="Describe the wedding package offered..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-package-url">Package URL</Label>
                <Input
                  id="vf-package-url"
                  value={packageUrl}
                  onChange={(e) => setPackageUrl(e.target.value)}
                  placeholder="https://..."
                  className={errors.package_url ? "border-destructive" : ""}
                />
                {errors.package_url && (
                  <p className="text-xs text-destructive">{errors.package_url}</p>
                )}
              </div>
            </div>
          </section>

          {/* Insights */}
          <section
            ref={(el) => { sectionRefs.current["insights"] = el; }}
            id="section-insights"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Insights
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="vf-insights">Insights</Label>
              <Textarea
                id="vf-insights"
                rows={5}
                value={insights}
                onChange={(e) => setInsights(e.target.value)}
                placeholder="Internal notes, highlights, and observations about this venue..."
              />
            </div>
          </section>

          {/* Amenities */}
          <section
            ref={(el) => { sectionRefs.current["amenities"] = el; }}
            id="section-amenities"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Amenities
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="vf-accommodation">Accommodation</Label>
                <Textarea
                  id="vf-accommodation"
                  rows={2}
                  value={accommodation}
                  onChange={(e) => setAccommodation(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-fnb">F&amp;B</Label>
                <Textarea
                  id="vf-fnb"
                  rows={2}
                  value={fnb}
                  onChange={(e) => setFnb(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-av-policy">AV / Policy</Label>
                <Textarea
                  id="vf-av-policy"
                  rows={2}
                  value={avPolicy}
                  onChange={(e) => setAvPolicy(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-facility">Facility</Label>
                <Textarea
                  id="vf-facility"
                  rows={2}
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vf-after-party">After Party</Label>
                <Textarea
                  id="vf-after-party"
                  rows={2}
                  value={afterParty}
                  onChange={(e) => setAfterParty(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Contact */}
          <section
            ref={(el) => { sectionRefs.current["contact"] = el; }}
            id="section-contact"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Contact
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vf-contact-name">Name</Label>
                  <Input
                    id="vf-contact-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vf-contact-title">Title</Label>
                  <Input
                    id="vf-contact-title"
                    value={contactTitle}
                    onChange={(e) => setContactTitle(e.target.value)}
                    placeholder="e.g. Events Manager"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vf-contact-email">Email</Label>
                <Input
                  id="vf-contact-email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={errors.contact_email ? "border-destructive" : ""}
                />
                {errors.contact_email && (
                  <p className="text-xs text-destructive">{errors.contact_email}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vf-contact-phone">Phone</Label>
                  <Input
                    id="vf-contact-phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vf-contact-alt-phone">Alt Phone</Label>
                  <Input
                    id="vf-contact-alt-phone"
                    value={contactAltPhone}
                    onChange={(e) => setContactAltPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vf-contact-raw">Contact Notes (raw)</Label>
                <Textarea
                  id="vf-contact-raw"
                  rows={3}
                  value={contactRaw}
                  onChange={(e) => setContactRaw(e.target.value)}
                  placeholder="Additional contact info, WhatsApp, Zalo..."
                />
              </div>
            </div>
          </section>

          {/* Areas */}
          <section
            ref={(el) => { sectionRefs.current["areas"] = el; }}
            id="section-areas"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Areas
              {areas.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {areas.length}
                </Badge>
              )}
            </h3>
            {errors.areas_general && (
              <p className="text-xs text-destructive mb-2">{errors.areas_general}</p>
            )}
            <VenueAreasEditor
              areas={areas}
              onChange={setAreas}
              errors={errors.areas ?? {}}
            />
          </section>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : mode === "create" ? "Create Venue" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
