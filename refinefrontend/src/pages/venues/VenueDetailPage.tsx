import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useOne, useList, useDelete, useInvalidate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { VenueDetailHeader } from "@/components/venues/VenueDetailHeader";
import { VenueDetailHero } from "@/components/venues/VenueDetailHero";
import { VenueKeyFacts } from "@/components/venues/VenueKeyFacts";
import { VenueOverviewTab } from "@/components/venues/VenueOverviewTab";
import { VenueAreasTab } from "@/components/venues/VenueAreasTab";
import { VenueAmenitiesTab } from "@/components/venues/VenueAmenitiesTab";
import { VenueContactTab } from "@/components/venues/VenueContactTab";
import type { ContactView } from "@/components/venues/VenueContactTab";
import { VenueGalleryTab } from "@/components/venues/VenueGalleryTab";
import { VenueWeddingsTab, type VenueWedding } from "@/components/venues/VenueWeddingsTab";
import { VenueForm } from "@/components/venues/VenueForm";
import type { VenueSupplier, VenueWeddingArea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VenueDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch venue ──────────────────────────────────────────────────────────
  const { result: venue, query: venueQuery } = useOne({
    resource: "Supplier",
    id: name!,
    meta: {
      fields: [
        "name",
        "supplier_name",
        "custom_venue_city",
        "custom_venue_location_subarea",
        "custom_venue_type",
        "custom_venue_price_range",
        "custom_venue_wedding_package_text",
        "custom_venue_wedding_package_url",
        "custom_venue_insights",
        "custom_venue_accommodation",
        "custom_venue_fnb",
        "custom_venue_av_policy",
        "custom_venue_facility",
        "custom_venue_after_party",
        "custom_venue_contact_raw",
        "custom_venue_source",
        "custom_cover_photo",
        "custom_venue_wedding_areas",
      ],
    },
  });

  // ── Fetch cover photo file_url ───────────────────────────────────────────
  const venueDoc = venue as VenueSupplier | undefined;
  const { result: coverFile } = useOne({
    resource: "File",
    id: venueDoc?.custom_cover_photo ?? "",
    meta: { fields: ["name", "file_url"] },
    queryOptions: { enabled: !!venueDoc?.custom_cover_photo },
  });
  const coverPhotoUrl = (coverFile as { file_url?: string } | undefined)?.file_url ?? null;

  // ── Fetch venue photos (same query as the Gallery tab, so it is shared) ──
  const { result: photosResult } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [
      { field: "attached_to_doctype", operator: "eq", value: "Supplier" },
      { field: "attached_to_name", operator: "eq", value: name! },
    ],
    meta: { fields: ["name", "file_url", "file_name", "creation", "custom_caption", "custom_venue_area"] },
    queryOptions: { enabled: !!name },
  });
  const photoUrls = useMemo(
    () =>
      ((photosResult?.data ?? []) as { file_url?: string }[])
        .map((f) => f.file_url ?? "")
        .filter((u) => /\.(jpg|jpeg|png|webp)$/i.test(u)),
    [photosResult?.data]
  );

  // ── Fetch linked Contact ─────────────────────────────────────────────────
  const { result: contactResult } = useList({
    resource: "Contact",
    pagination: { mode: "off" },
    meta: {
      // Contact links to a Supplier through its Dynamic Link child table
      rawFilters: [
        ["Dynamic Link", "link_doctype", "=", "Supplier"],
        ["Dynamic Link", "link_name", "=", name!],
      ],
      fields: [
        "name",
        "first_name",
        "last_name",
        "designation",
        "email_id",
        "phone",
        "mobile_no",
      ],
    },
    queryOptions: { enabled: !!name },
  });
  interface ContactDoc {
    first_name?: string;
    last_name?: string;
    designation?: string;
    email_id?: string;
    phone?: string;
    mobile_no?: string;
  }
  const contactDoc: ContactDoc | null = (contactResult?.data?.[0] as ContactDoc) ?? null;

  const contact: ContactView | null = contactDoc
    ? {
        name: [contactDoc.first_name, contactDoc.last_name]
          .filter(Boolean)
          .join(" ") || undefined,
        title: contactDoc.designation || undefined,
        email: contactDoc.email_id || undefined,
        phone: contactDoc.phone || contactDoc.mobile_no || undefined,
        alt_phone:
          contactDoc.phone &&
          contactDoc.mobile_no &&
          contactDoc.phone !== contactDoc.mobile_no
            ? contactDoc.mobile_no
            : undefined,
      }
    : null;

  // ── Fetch weddings ───────────────────────────────────────────────────────
  const { result: weddingsResult } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    filters: [{ field: "custom_venue", operator: "eq", value: name! }],
    sorters: [{ field: "delivery_date", order: "desc" }],
    meta: {
      fields: ["name", "customer_name", "delivery_date", "status", "grand_total", "project"],
    },
    queryOptions: { enabled: !!name },
  });
  const weddings: VenueWedding[] = (weddingsResult?.data as VenueWedding[]) ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const { mutate: deleteVenue } = useDelete();

  function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    deleteVenue(
      {
        resource: "Supplier",
        id: name!,
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => navigate("/venues"),
        onError: (err: { message?: string }) => {
          setDeleting(false);
          setDeleteError(err?.message ?? "Failed to delete venue.");
        },
      }
    );
  }

  // ── Loading / error states ───────────────────────────────────────────────
  if (venueQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading venue">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-[200px] w-full rounded-2xl md:h-[310px]" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (venueQuery.isError || !venue) {
    return (
      <div>
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="text-sm">Venue not found.</span>
        </div>
      </div>
    );
  }

  const v = venue as VenueSupplier;
  const areas: VenueWeddingArea[] = v.custom_venue_wedding_areas ?? [];
  const driveLinkUrl = areas.find((a) => a.photos_url)?.photos_url ?? null;

  return (
    <div className="space-y-5">
      <VenueDetailHeader
        venue={v}
        onEdit={() => setEditOpen(true)}
        onDelete={() => {
          setDeleteError(null);
          setDeleteOpen(true);
        }}
      />

      <VenueDetailHero
        venue={v}
        coverPhotoUrl={coverPhotoUrl}
        photoUrls={photoUrls}
        driveLinkUrl={driveLinkUrl}
        onSeeAll={() => setTab("gallery")}
      />

      <VenueKeyFacts venue={v} areas={areas} weddingsCount={weddings.length} />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="scrollbar-hide flex w-full max-w-full justify-start gap-2 overflow-x-auto md:gap-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="areas">
            Areas {areas.length > 0 && `(${areas.length})`}
          </TabsTrigger>
          <TabsTrigger value="amenities">Amenities</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="gallery">
            Gallery {photoUrls.length > 0 && `(${photoUrls.length})`}
          </TabsTrigger>
          <TabsTrigger value="weddings">
            Weddings {weddings.length > 0 && `(${weddings.length})`}
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <VenueOverviewTab venue={v} />
        </TabsContent>

        <TabsContent value="areas" className="mt-4">
          <VenueAreasTab areas={areas} onEditAreas={() => setEditOpen(true)} />
        </TabsContent>

        <TabsContent value="amenities" className="mt-4">
          <VenueAmenitiesTab venue={v} />
        </TabsContent>

        <TabsContent value="contact" className="mt-4">
          <VenueContactTab venue={v} contact={contact} />
        </TabsContent>

        <TabsContent value="gallery" className="mt-4">
          <VenueGalleryTab
            venueName={v.name}
            areas={areas}
            currentCoverPhotoName={v.custom_cover_photo}
          />
        </TabsContent>

        <TabsContent value="weddings" className="mt-4">
          <VenueWeddingsTab weddings={weddings} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <InternalNotesSection references={[{ doctype: "Supplier", docName: name! }]} />
        </TabsContent>
      </Tabs>

      {/* Edit sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Edit Venue</SheetTitle>
          </SheetHeader>
          <VenueForm
            mode="edit"
            initialValue={{ ...v, areas } as Partial<VenueSupplier> & { areas?: VenueWeddingArea[] }}
            contactInitialValue={contact ?? undefined}
            onSaved={() => {
              setEditOpen(false);
              void venueQuery.refetch();
              invalidate({ resource: "Contact", invalidates: ["list"] });
            }}
            onCancel={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Venue</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{v.supplier_name}</span>? This
              action cannot be undone.
            </p>
            {deleteError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm">{deleteError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Venue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
