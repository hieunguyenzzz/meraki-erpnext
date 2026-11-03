import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useList, useCreate } from "@refinedev/core";
import { useQueryState } from "nuqs";
import { Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/pages/projects/weddings-list/StatePanel";
import { VendorFormSheet } from "@/components/vendors/VendorFormSheet";
import { EMPTY_VENDOR_FORM, type VendorFormValue, type VendorRow } from "@/lib/vendor";
import { VendorCard, VendorCardsSkeleton } from "./vendors-list/VendorCard";
import { VendorsFilterBar } from "./vendors-list/VendorsFilterBar";

export default function VendorsPage() {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [categoryFilter, setCategoryFilter] = useQueryState("category", { defaultValue: "" });

  const [form, setForm] = useState<VendorFormValue>(EMPTY_VENDOR_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { result: vendorsResult, query: vendorsQuery } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    filters: [{ field: "supplier_group", operator: "eq", value: "Wedding Vendors" }],
    meta: {
      fields: [
        "name",
        "supplier_name",
        "custom_vendor_category",
        "custom_contact_phone",
        "custom_contact_email",
        "custom_contact_person",
        "website",
      ],
    },
  });
  const vendors = useMemo(() => (vendorsResult?.data ?? []) as VendorRow[], [vendorsResult]);

  // Batch fetch cover images
  const vendorNames = useMemo(() => vendors.map((v) => v.name), [vendors]);
  const { result: filesResult } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [
      { field: "attached_to_doctype", operator: "eq", value: "Supplier" },
      { field: "attached_to_name", operator: "in", value: vendorNames },
    ],
    meta: { fields: ["name", "file_url", "attached_to_name"] },
    queryOptions: { enabled: vendorNames.length > 0 },
  });
  const coverImages = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of filesResult?.data ?? []) {
      if (!map[f.attached_to_name] && /\.(jpg|jpeg|png|webp)$/i.test(f.file_url)) {
        map[f.attached_to_name] = f.file_url;
      }
    }
    return map;
  }, [filesResult]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vendors) {
      if (v.custom_vendor_category) counts.set(v.custom_vendor_category, (counts.get(v.custom_vendor_category) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
  }, [vendors]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return vendors.filter(
      (v) =>
        v.supplier_name.toLowerCase().includes(s) &&
        (!categoryFilter || v.custom_vendor_category === categoryFilter)
    );
  }, [vendors, search, categoryFilter]);

  const { mutate: createVendor } = useCreate();

  function openAdd() {
    setForm(EMPTY_VENDOR_FORM);
    setCreateError(null);
    setSheetOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      setCreateError("Vendor name is required.");
      return;
    }
    setCreateError(null);
    setCreating(true);
    createVendor(
      {
        resource: "Supplier",
        values: {
          supplier_name: form.name.trim(),
          supplier_group: "Wedding Vendors",
          supplier_type: "Company",
          country: "Vietnam",
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
        onSuccess: (data) => {
          setCreating(false);
          setSheetOpen(false);
          setForm(EMPTY_VENDOR_FORM);
          navigate(`/vendors/${data.data.name}`);
        },
        onError: (err: { message?: string }) => {
          console.error("Create vendor failed", err);
          setCreating(false);
          setCreateError(err?.message ?? "Failed to create vendor.");
        },
      }
    );
  }

  if (vendorsQuery.isError) console.error("Vendors list failed", vendorsQuery.error);
  const isFiltered = !!search || !!categoryFilter;

  let body;
  if (vendorsQuery.isError) {
    body = (
      <StatePanel
        kind="error"
        title="Couldn't load vendors"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => void vendorsQuery.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  } else if (vendorsQuery.isLoading) {
    body = <VendorCardsSkeleton />;
  } else if (filtered.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        title={isFiltered ? "No vendors match" : "No vendors yet"}
        text={isFiltered ? "Try a different category or search." : "Add the first vendor to start building the list."}
        action={isFiltered ? undefined : { label: "Add vendor", onClick: openAdd }}
      />
    );
  } else {
    body = (
      <>
        <span className="px-1 text-[13px] text-muted-foreground md:text-sm">
          {filtered.length} vendor{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-4">
          {filtered.map((v) => (
            <VendorCard key={v.name} vendor={v} coverUrl={coverImages[v.name]} />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Vendors</h1>
        <Button onClick={openAdd} className="shrink-0" aria-label="Add vendor">
          <Plus className="h-4 w-4" />
          <span className="md:hidden">Vendor</span>
          <span className="max-md:hidden">Add vendor</span>
        </Button>
      </header>

      <VendorsFilterBar
        search={search}
        onSearch={setSearch}
        category={categoryFilter}
        onCategory={setCategoryFilter}
        categories={categories}
        total={vendors.length}
      />

      {body}

      <VendorFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Add Vendor"
        idPrefix="add"
        value={form}
        onChange={setForm}
        error={createError}
        busy={creating}
        submitLabel="Create Vendor"
        busyLabel="Creating..."
        onSubmit={handleSubmit}
      />
    </div>
  );
}
