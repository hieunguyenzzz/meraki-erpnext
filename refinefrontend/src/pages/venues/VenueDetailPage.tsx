import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useOne, useList, useUpdate, useDelete, useInvalidate } from "@refinedev/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  MapPin,
  Users,
  DollarSign,
  User,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { uploadFile } from "@/lib/fileUpload";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { formatDate } from "@/lib/format";

function parseFeatures(raw?: string | null): string[] {
  if (!raw) return [];
  return raw.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
}

function soStatusVariant(s: string): "success" | "destructive" | "warning" | "secondary" {
  if (s === "Completed") return "success";
  if (s === "Cancelled") return "destructive";
  if (s === "To Deliver and Bill") return "warning";
  return "secondary";
}

export default function VenueDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  // Edit sheet state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCapacityMin, setEditCapacityMin] = useState("");
  const [editCapacityMax, setEditCapacityMax] = useState("");
  const [editPriceRange, setEditPriceRange] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editFeatures, setEditFeatures] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Gallery state
  const [uploading, setUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch venue
  const { result: venue, query } = useOne({
    resource: "Supplier",
    id: name!,
    meta: {
      fields: [
        "name",
        "supplier_name",
        "custom_venue_city",
        "custom_location",
        "custom_capacity_min",
        "custom_capacity_max",
        "custom_price_range",
        "custom_features",
        "custom_contact_person",
        "custom_notes",
      ],
    },
  });

  // Gallery files
  const { result: filesResult, query: filesQuery } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [
      { field: "attached_to_doctype", operator: "eq", value: "Supplier" },
      { field: "attached_to_name", operator: "eq", value: name! },
    ],
    meta: { fields: ["name", "file_url", "file_name", "creation"] },
    queryOptions: { enabled: !!name },
  });

  const images = useMemo(
    () => (filesResult?.data ?? []).filter((f: any) => /\.(jpg|jpeg|png|webp)$/i.test(f.file_url)),
    [filesResult]
  );

  // Weddings at this venue
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
  const weddings = weddingsResult?.data ?? [];

  // Mutations
  const { mutate: updateVenue } = useUpdate();
  const [updating, setUpdating] = useState(false);
  const { mutate: deleteVenue } = useDelete();

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i + 1) % images.length);
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, images.length]);

  // Populate edit form when venue loads or sheet opens
  function openEditSheet() {
    if (!venue) return;
    setEditName((venue as any).supplier_name ?? "");
    setEditCity((venue as any).custom_venue_city ?? "");
    setEditLocation((venue as any).custom_location ?? "");
    setEditCapacityMin((venue as any).custom_capacity_min?.toString() ?? "");
    setEditCapacityMax((venue as any).custom_capacity_max?.toString() ?? "");
    setEditPriceRange((venue as any).custom_price_range ?? "");
    setEditContact((venue as any).custom_contact_person ?? "");
    setEditFeatures(
      parseFeatures((venue as any).custom_features).join("\n")
    );
    setEditNotes((venue as any).custom_notes ?? "");
    setEditError(null);
    setEditOpen(true);
  }

  function handleUpdate() {
    if (!editName.trim()) {
      setEditError("Venue name is required.");
      return;
    }
    setEditError(null);
    setUpdating(true);
    updateVenue(
      {
        resource: "Supplier",
        id: name!,
        values: {
          supplier_name: editName.trim(),
          custom_venue_city: editCity || undefined,
          custom_location: editLocation || undefined,
          custom_capacity_min: editCapacityMin ? Number(editCapacityMin) : undefined,
          custom_capacity_max: editCapacityMax ? Number(editCapacityMax) : undefined,
          custom_price_range: editPriceRange || undefined,
          custom_contact_person: editContact || undefined,
          custom_features: editFeatures || undefined,
          custom_notes: editNotes || undefined,
        },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          setUpdating(false);
          setEditOpen(false);
          invalidate({ resource: "Supplier", invalidates: ["detail"] });
        },
        onError: (err: any) => {
          setUpdating(false);
          setEditError(err?.message ?? "Failed to update venue.");
        },
      }
    );
  }

  function handleDelete() {
    setDeleteError(null);
    deleteVenue(
      {
        resource: "Supplier",
        id: name!,
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => navigate("/venues"),
        onError: (err: any) => {
          setDeleteError(err?.message ?? "Failed to delete venue.");
        },
      }
    );
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file, "Supplier", name!, false);
      invalidate({ resource: "File", invalidates: ["list"] });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (query.isLoading) {
    return (
      <div className="p-6 text-muted-foreground text-sm">Loading venue...</div>
    );
  }

  if (query.isError || !venue) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="text-sm">Venue not found.</span>
        </div>
      </div>
    );
  }

  const v = venue as any;
  const features = parseFeatures(v.custom_features);

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => navigate("/venues")}
        >
          <ArrowLeft className="h-4 w-4" />
          Venues
        </Button>
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">{v.supplier_name}</h1>
          {v.custom_venue_city && (
            <Badge variant="secondary">{v.custom_venue_city}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openEditSheet}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* LEFT: Info sidebar */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            {v.custom_location && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{v.custom_location}</span>
              </div>
            )}
            {(v.custom_capacity_min || v.custom_capacity_max) && (
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  Capacity:{" "}
                  {v.custom_capacity_min && v.custom_capacity_max
                    ? `${v.custom_capacity_min} – ${v.custom_capacity_max}`
                    : v.custom_capacity_min || v.custom_capacity_max}
                </span>
              </div>
            )}
            {v.custom_price_range && (
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{v.custom_price_range}</span>
              </div>
            )}
            {v.custom_contact_person && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{v.custom_contact_person}</span>
              </div>
            )}

            {features.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Features
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {features.map((f, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{weddings.length}</span>
              {weddings.length === 1 ? "wedding" : "weddings"}
            </div>
          </div>
        </div>

        {/* RIGHT: Tabs */}
        <div>
          <Tabs defaultValue="gallery">
            <TabsList>
              <TabsTrigger value="gallery">Gallery</TabsTrigger>
              <TabsTrigger value="weddings">
                Weddings {weddings.length > 0 && `(${weddings.length})`}
              </TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* Gallery Tab */}
            <TabsContent value="gallery" className="mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {images.length} {images.length === 1 ? "photo" : "photos"}
                  </p>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4 mr-1.5" />
                      {uploading ? "Uploading..." : "Upload Photo"}
                    </Button>
                  </div>
                </div>

                {filesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading photos...</div>
                ) : images.length === 0 ? (
                  <div
                    className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-16 gap-3 cursor-pointer text-muted-foreground hover:border-primary/50 hover:text-primary/70 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-10 w-10" />
                    <p className="text-sm">No photos yet. Upload the first one.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((img: any, idx: number) => (
                      <div
                        key={img.name}
                        className="aspect-square rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => {
                          setLightboxIndex(idx);
                          setLightboxOpen(true);
                        }}
                      >
                        <img
                          src={img.file_url}
                          alt={img.file_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Weddings Tab */}
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
                      {weddings.map((w: any) => (
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
                            <Badge variant={soStatusVariant(w.status)}>{w.status}</Badge>
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

            {/* Notes Tab */}
            <TabsContent value="notes" className="mt-4">
              <InternalNotesSection references={[{ doctype: "Supplier", docName: name! }]} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <div className="relative flex items-center justify-center min-h-[400px]">
            {images.length > 0 && (
              <img
                src={images[lightboxIndex]?.file_url}
                alt={images[lightboxIndex]?.file_name}
                className="max-h-[80vh] max-w-full object-contain"
              />
            )}

            {/* Previous button */}
            {images.length > 1 && (
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition-colors"
                onClick={() => setLightboxIndex((i) => (i - 1 + images.length) % images.length)}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Next button */}
            {images.length > 1 && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition-colors"
                onClick={() => setLightboxIndex((i) => (i + 1) % images.length)}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {/* Counter */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 rounded-full px-3 py-1">
                {lightboxIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Edit Venue</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {editError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm">{editError}</span>
              </div>
            )}

            {/* Identity */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Identity
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">
                  Venue Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-city">City</Label>
                <Input
                  id="edit-city"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  placeholder="e.g. Ho Chi Minh City"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. 123 Nguyen Hue, District 1"
                />
              </div>
            </div>

            <Separator />

            {/* Capacity & Pricing */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Capacity &amp; Pricing
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cap-min">Capacity Min</Label>
                  <Input
                    id="edit-cap-min"
                    type="number"
                    value={editCapacityMin}
                    onChange={(e) => setEditCapacityMin(e.target.value)}
                    placeholder="e.g. 100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cap-max">Capacity Max</Label>
                  <Input
                    id="edit-cap-max"
                    type="number"
                    value={editCapacityMax}
                    onChange={(e) => setEditCapacityMax(e.target.value)}
                    placeholder="e.g. 500"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-price">Price Range</Label>
                <Input
                  id="edit-price"
                  value={editPriceRange}
                  onChange={(e) => setEditPriceRange(e.target.value)}
                  placeholder="e.g. 50,000,000 – 200,000,000 đ"
                />
              </div>
            </div>

            <Separator />

            {/* Contact */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contact
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="edit-contact">Contact Person</Label>
                <Input
                  id="edit-contact"
                  value={editContact}
                  onChange={(e) => setEditContact(e.target.value)}
                  placeholder="e.g. Nguyen Van A"
                />
              </div>
            </div>

            <Separator />

            {/* About */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                About
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="edit-features">Features</Label>
                <Textarea
                  id="edit-features"
                  value={editFeatures}
                  onChange={(e) => setEditFeatures(e.target.value)}
                  placeholder="Pool&#10;Garden&#10;Parking"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">One feature per line</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Additional notes about this venue..."
                  rows={4}
                />
              </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updating}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Venue</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{v.supplier_name}</span>? This action
              cannot be undone.
            </p>
            {deleteError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm">{deleteError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Venue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
