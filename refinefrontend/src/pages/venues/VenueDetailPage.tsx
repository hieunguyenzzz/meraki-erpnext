import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useOne, useList, useDelete, useInvalidate } from "@refinedev/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { VenueDetailHero } from "@/components/venues/VenueDetailHero";
import { VenueOverviewTab } from "@/components/venues/VenueOverviewTab";
import { VenueAreasTab } from "@/components/venues/VenueAreasTab";
import { VenueAmenitiesTab } from "@/components/venues/VenueAmenitiesTab";
import { VenueContactTab } from "@/components/venues/VenueContactTab";
import type { ContactView } from "@/components/venues/VenueContactTab";
import { VenueGalleryTab } from "@/components/venues/VenueGalleryTab";
import { VenueForm } from "@/components/venues/VenueForm";
import { formatDate } from "@/lib/format";
import type { VenueSupplier, VenueWeddingArea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BadgeVariant = "info" | "success" | "warning" | "destructive" | "outline" | "secondary";

const PRICE_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  LOW: "info",
  MID: "success",
  HIGH: "warning",
  LUXURY: "destructive",
  UNKNOWN: "outline",
};

function priceBadgeVariant(value: string): BadgeVariant {
  return PRICE_BADGE_VARIANTS[value.toUpperCase()] ?? "outline";
}

function soStatusVariant(s: string): "success" | "destructive" | "warning" | "secondary" {
  if (s === "Completed") return "success";
  if (s === "Cancelled") return "destructive";
  if (s === "To Deliver and Bill") return "warning";
  return "secondary";
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VenueDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

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

  // ── Fetch linked Contact ─────────────────────────────────────────────────
  const { result: contactResult } = useList({
    resource: "Contact",
    pagination: { mode: "off" },
    filters: [
      { field: "link_doctype", operator: "eq", value: "Supplier" },
      { field: "link_name", operator: "eq", value: name! },
    ],
    meta: {
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
  interface WeddingRow {
    name: string;
    customer_name?: string;
    delivery_date?: string;
    status?: string;
    grand_total?: number;
    project?: string;
  }
  const weddings: WeddingRow[] = (weddingsResult?.data as WeddingRow[]) ?? [];

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
    return <div className="p-6 text-muted-foreground text-sm">Loading venue...</div>;
  }

  if (venueQuery.isError || !venue) {
    return (
      <div className="p-6">
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
    <div className="p-6 space-y-6">
      {/* Header bar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate("/venues")}
          >
            <ArrowLeft className="h-4 w-4" />
            Venues
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{v.supplier_name}</h1>
          {v.custom_venue_city && (
            <Badge variant="secondary">{v.custom_venue_city}</Badge>
          )}
          {v.custom_venue_location_subarea && (
            <span className="text-sm text-muted-foreground">
              · {v.custom_venue_location_subarea}
            </span>
          )}
          {v.custom_venue_type && (
            <Badge variant="secondary">{v.custom_venue_type}</Badge>
          )}
          {v.custom_venue_price_range && (v.custom_venue_price_range as string) !== "" && (
            <Badge variant={priceBadgeVariant(v.custom_venue_price_range)}>
              {v.custom_venue_price_range}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Hero */}
      <VenueDetailHero
        venue={v}
        areas={areas}
        coverPhotoUrl={coverPhotoUrl}
        weddingsCount={weddings.length}
        driveLinkUrl={driveLinkUrl}
      />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="areas">
            Areas {areas.length > 0 && `(${areas.length})`}
          </TabsTrigger>
          <TabsTrigger value="amenities">Amenities</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
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
          {weddings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No weddings at this venue yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Couple</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weddings.map((w) => (
                    <TableRow key={w.name}>
                      <TableCell className="font-medium">
                        {w.project ? (
                          <Link
                            to={`/projects/${w.project}`}
                            className="text-primary hover:underline"
                          >
                            {w.customer_name}
                          </Link>
                        ) : (
                          w.customer_name
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {w.delivery_date ? formatDate(w.delivery_date) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={soStatusVariant(w.status ?? "")}>{w.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {w.grand_total ? formatVND(w.grand_total) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
