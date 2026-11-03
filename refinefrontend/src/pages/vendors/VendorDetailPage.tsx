import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useOne, useList, useUpdate, useDelete, useInvalidate } from "@refinedev/core";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { VendorDetailHeader } from "@/components/vendors/VendorDetailHeader";
import { VendorInfoCard } from "@/components/vendors/VendorInfoCard";
import { VendorGalleryTab, type VendorImage } from "@/components/vendors/VendorGalleryTab";
import { VendorWeddingsTab, type VendorWedding } from "@/components/vendors/VendorWeddingsTab";
import { VendorFormSheet } from "@/components/vendors/VendorFormSheet";
import { EMPTY_VENDOR_FORM, type VendorFormValue } from "@/lib/vendor";

interface VendorDoc {
  name: string;
  supplier_name: string;
  custom_vendor_category?: string;
  custom_contact_person?: string;
  custom_contact_phone?: string;
  custom_contact_email?: string;
  custom_notes?: string;
  website?: string;
}

export default function VendorDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const [tab, setTab] = useState("gallery");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<VendorFormValue>(EMPTY_VENDOR_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    () => ((filesResult?.data ?? []) as VendorImage[]).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.file_url)),
    [filesResult]
  );

  // Weddings using this vendor: Projects via the Wedding Vendor child table
  const { result: weddingsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    // Child-table filters must go through rawFilters; a "Wedding Vendor.supplier" field filter is rejected (417).
    meta: {
      fields: ["name", "project_name", "expected_end_date", "status"],
      rawFilters: [["Wedding Vendor", "supplier", "=", name!]],
    },
    queryOptions: { enabled: !!name },
  });
  const weddings = (weddingsResult?.data ?? []) as VendorWedding[];

  const { mutate: updateVendor } = useUpdate();
  const { mutate: deleteVendor } = useDelete();

  function openEdit() {
    if (!vendor) return;
    const v = vendor as VendorDoc;
    setForm({
      name: v.supplier_name ?? "",
      category: v.custom_vendor_category ?? "",
      contact: v.custom_contact_person ?? "",
      phone: v.custom_contact_phone ?? "",
      email: v.custom_contact_email ?? "",
      website: v.website ?? "",
      notes: v.custom_notes ?? "",
    });
    setEditError(null);
    setEditOpen(true);
  }

  function handleUpdate() {
    if (!form.name.trim()) {
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
          supplier_name: form.name.trim(),
          custom_vendor_category: form.category || undefined,
          custom_contact_person: form.contact || undefined,
          custom_contact_phone: form.phone || undefined,
          custom_contact_email: form.email || undefined,
          website: form.website || undefined,
          custom_notes: form.notes || undefined,
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
        onError: (err: { message?: string }) => {
          console.error("Update vendor failed", err);
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
      { resource: "Supplier", id: name!, successNotification: false, errorNotification: false },
      {
        onSuccess: () => navigate("/vendors"),
        onError: (err: { message?: string }) => {
          console.error("Delete vendor failed", err);
          setDeleting(false);
          setDeleteError(err?.message ?? "Failed to delete vendor.");
        },
      }
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading vendor">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (query.isError || !vendor) {
    if (query.isError) console.error("Vendor load failed", query.error);
    return (
      <div role="alert" className="flex gap-2 rounded-xl border border-destructive/20 bg-danger-soft p-3 text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="text-sm">Vendor not found.</span>
      </div>
    );
  }

  const v = vendor as VendorDoc;

  return (
    <div className="space-y-5">
      <VendorDetailHeader
        name={v.supplier_name}
        category={v.custom_vendor_category}
        onEdit={openEdit}
        onDelete={() => {
          setDeleteError(null);
          setDeleteOpen(true);
        }}
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
        <div className="lg:sticky lg:top-6">
          <VendorInfoCard
            contact={v.custom_contact_person}
            phone={v.custom_contact_phone}
            email={v.custom_contact_email}
            website={v.website}
            weddingsCount={weddings.length}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="scrollbar-hide flex w-full max-w-full justify-start gap-2 overflow-x-auto md:gap-5">
            <TabsTrigger value="gallery">Gallery {images.length > 0 && `(${images.length})`}</TabsTrigger>
            <TabsTrigger value="weddings">Weddings {weddings.length > 0 && `(${weddings.length})`}</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>
          <TabsContent value="gallery" className="mt-4">
            <VendorGalleryTab vendorName={name!} images={images} loading={filesQuery.isLoading} />
          </TabsContent>
          <TabsContent value="weddings" className="mt-4">
            <VendorWeddingsTab weddings={weddings} />
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <InternalNotesSection references={[{ doctype: "Supplier", docName: name! }]} />
          </TabsContent>
        </Tabs>
      </div>

      <VendorFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Vendor"
        idPrefix="edit"
        value={form}
        onChange={setForm}
        error={editError}
        busy={updating}
        submitLabel="Save Changes"
        busyLabel="Saving..."
        onSubmit={handleUpdate}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{v.supplier_name}</span>? This action cannot be undone.
            </p>
            {deleteError && (
              <div role="alert" className="flex gap-2 rounded-xl border border-destructive/20 bg-danger-soft p-3 text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-sm">{deleteError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
