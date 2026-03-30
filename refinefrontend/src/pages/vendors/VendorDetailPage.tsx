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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Globe,
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

const VENDOR_CATEGORIES = [
  "Decoration / Floral",
  "Photography",
  "Videography",
  "Makeup & Hair",
  "MC / Emcee",
  "Music / DJ / Band",
  "Catering",
  "Wedding Cake",
  "Invitation / Stationery",
  "Bridal Attire",
  "Transportation",
  "Lighting / Effects",
];

export default function VendorDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  // Edit sheet state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Gallery state
  const [uploading, setUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch vendor
  const { result: vendor, query } = useOne({
    resource: "Supplier",
    id: name!,
    meta: {
      fields: [
        "name",
        "supplier_name",
        "custom_vendor_category",
        "custom_contact_person",
        "custom_contact_phone",
        "custom_contact_email",
        "custom_notes",
        "website",
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

  // Weddings using this vendor — query Projects via Wedding Vendor child table
  const { result: weddingsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    filters: [{ field: "Wedding Vendor.supplier", operator: "eq", value: name! }],
    meta: {
      fields: ["name", "project_name", "expected_end_date", "status"],
    },
    queryOptions: { enabled: !!name },
  });
  const weddings = weddingsResult?.data ?? [];

  // Mutations
  const { mutate: updateVendor } = useUpdate();
  const [updating, setUpdating] = useState(false);
  const { mutate: deleteVendor } = useDelete();

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

  function openEditSheet() {
    if (!vendor) return;
    const v = vendor as any;
    setEditName(v.supplier_name ?? "");
    setEditCategory(v.custom_vendor_category ?? "");
    setEditContact(v.custom_contact_person ?? "");
    setEditPhone(v.custom_contact_phone ?? "");
    setEditEmail(v.custom_contact_email ?? "");
    setEditWebsite(v.website ?? "");
    setEditNotes(v.custom_notes ?? "");
    setEditError(null);
    setEditOpen(true);
  }

  function handleUpdate() {
    if (!editName.trim()) {
      setEditError("Vendor name is required.");
      return;
    }
    setEditError(null);
    setUpdating(true);
    updateVendor(
      {
        resource: "Supplier",
        id: name!,
        values: {
          supplier_name: editName.trim(),
          custom_vendor_category: editCategory || undefined,
          custom_contact_person: editContact || undefined,
          custom_contact_phone: editPhone || undefined,
          custom_contact_email: editEmail || undefined,
          website: editWebsite || undefined,
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
          setEditError(err?.message ?? "Failed to update vendor.");
        },
      }
    );
  }

  function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    deleteVendor(
      {
        resource: "Supplier",
        id: name!,
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => navigate("/vendors"),
        onError: (err: any) => {
          setDeleting(false);
          setDeleteError(err?.message ?? "Failed to delete vendor.");
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
      <div className="p-6 text-muted-foreground text-sm">Loading vendor...</div>
    );
  }

  if (query.isError || !vendor) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="text-sm">Vendor not found.</span>
        </div>
      </div>
    );
  }

  const v = vendor as any;

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => navigate("/vendors")}
        >
          <ArrowLeft className="h-4 w-4" />
          Vendors
        </Button>
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">{v.supplier_name}</h1>
          {v.custom_vendor_category && (
            <Badge variant="secondary">{v.custom_vendor_category}</Badge>
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
            {v.custom_contact_person && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{v.custom_contact_person}</span>
              </div>
            )}
            {v.custom_contact_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{v.custom_contact_phone}</span>
              </div>
            )}
            {v.custom_contact_email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{v.custom_contact_email}</span>
              </div>
            )}
            {v.website && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <a
                  href={v.website.startsWith("http") ? v.website : `https://${v.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate"
                >
                  {v.website}
                </a>
              </div>
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
                  No weddings with this vendor yet.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wedding</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weddings.map((w: any) => (
                        <TableRow key={w.name}>
                          <TableCell className="font-medium">
                            <Link
                              to={`/projects/${w.name}`}
                              className="text-primary hover:underline"
                            >
                              {w.project_name || w.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {w.expected_end_date ? formatDate(w.expected_end_date) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{w.status}</Badge>
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

            {images.length > 1 && (
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition-colors"
                onClick={() => setLightboxIndex((i) => (i - 1 + images.length) % images.length)}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {images.length > 1 && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition-colors"
                onClick={() => setLightboxIndex((i) => (i + 1) % images.length)}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

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
            <SheetTitle>Edit Vendor</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {editError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm">{editError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="edit-name">
                Vendor Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={editCategory || "__none__"}
                onValueChange={(v) => setEditCategory(v === "__none__" ? "" : v)}
              >
                <SelectTrigger id="edit-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {VENDOR_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="edit-contact">Contact Person</Label>
              <Input
                id="edit-contact"
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
                placeholder="e.g. Nguyen Van A"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="e.g. 0912 345 678"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="e.g. info@studio.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-website">Website</Label>
              <Input
                id="edit-website"
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                placeholder="e.g. https://studio.com"
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Additional notes about this vendor..."
                rows={4}
              />
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
            <DialogTitle>Delete Vendor</DialogTitle>
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
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
