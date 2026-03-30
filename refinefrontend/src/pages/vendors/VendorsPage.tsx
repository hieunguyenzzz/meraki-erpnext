import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useList, useCreate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Plus, Phone } from "lucide-react";

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

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function VendorsPage() {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("__all__");

  // Add vendor form state
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch all vendors
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
      ],
    },
  });
  const vendors = vendorsResult?.data ?? [];

  // Batch fetch cover images
  const vendorNames = useMemo(() => vendors.map((v: any) => v.name), [vendors]);

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
    const files = filesResult?.data ?? [];
    const map: Record<string, string> = {};
    for (const f of files) {
      if (!map[f.attached_to_name] && /\.(jpg|jpeg|png|webp)$/i.test(f.file_url)) {
        map[f.attached_to_name] = f.file_url;
      }
    }
    return map;
  }, [filesResult]);

  // Client-side filtering
  const categories = useMemo(
    () =>
      [...new Set(vendors.map((v: any) => v.custom_vendor_category).filter(Boolean))].sort() as string[],
    [vendors]
  );

  const filtered = useMemo(
    () =>
      vendors.filter((v: any) => {
        const nameMatch = v.supplier_name.toLowerCase().includes(search.toLowerCase());
        const catMatch = categoryFilter === "__all__" || v.custom_vendor_category === categoryFilter;
        return nameMatch && catMatch;
      }),
    [vendors, search, categoryFilter]
  );

  const { mutate: createVendor } = useCreate();
  const [creating, setCreating] = useState(false);

  function resetForm() {
    setFormName("");
    setFormCategory("");
    setFormContact("");
    setFormPhone("");
    setFormEmail("");
    setFormWebsite("");
    setFormNotes("");
    setCreateError(null);
  }

  function handleSubmit() {
    if (!formName.trim()) {
      setCreateError("Vendor name is required.");
      return;
    }
    setCreateError(null);
    setCreating(true);
    createVendor(
      {
        resource: "Supplier",
        values: {
          supplier_name: formName.trim(),
          supplier_group: "Wedding Vendors",
          supplier_type: "Company",
          country: "Vietnam",
          custom_vendor_category: formCategory || undefined,
          custom_contact_person: formContact || undefined,
          custom_contact_phone: formPhone || undefined,
          custom_contact_email: formEmail || undefined,
          website: formWebsite || undefined,
          custom_notes: formNotes || undefined,
        },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: (data) => {
          setCreating(false);
          setSheetOpen(false);
          resetForm();
          navigate(`/vendors/${data.data.name}`);
        },
        onError: (err: any) => {
          setCreating(false);
          setCreateError(err?.message ?? "Failed to create vendor.");
        },
      }
    );
  }

  const isLoading = vendorsQuery.isLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
        <Button onClick={() => { resetForm(); setSheetOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-muted-foreground text-sm">Loading vendors...</div>
      )}

      {/* Grid */}
      {!isLoading && (
        <>
          {filtered.length === 0 ? (
            <div className="text-muted-foreground text-sm py-12 text-center">
              No vendors found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((v: any) => {
                const coverUrl = coverImages[v.name];
                const initials = getInitials(v.supplier_name);
                return (
                  <div
                    key={v.name}
                    className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/vendors/${v.name}`)}
                  >
                    {/* Photo or placeholder */}
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={v.supplier_name}
                        className="w-full h-40 object-cover"
                      />
                    ) : (
                      <div className="w-full h-40 bg-gradient-to-br from-[#C9A9A6]/30 to-[#C4A962]/20 flex items-center justify-center">
                        <span className="text-4xl font-bold text-[#C9A9A6]/70 select-none">
                          {initials}
                        </span>
                      </div>
                    )}

                    {/* Card body */}
                    <div className="p-4 space-y-1.5">
                      <p className="font-semibold text-base leading-tight">{v.supplier_name}</p>
                      {v.custom_vendor_category && (
                        <Badge variant="secondary" className="text-xs">
                          {v.custom_vendor_category}
                        </Badge>
                      )}
                      {v.custom_contact_phone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {v.custom_contact_phone}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add Vendor Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Add Vendor</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {createError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-sm">{createError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="add-name">
                Vendor Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Studio ABC Photography"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-category">Category</Label>
              <Select
                value={formCategory || "__none__"}
                onValueChange={(v) => setFormCategory(v === "__none__" ? "" : v)}
              >
                <SelectTrigger id="add-category">
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

            <div className="space-y-1.5">
              <Label htmlFor="add-contact">Contact Person</Label>
              <Input
                id="add-contact"
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
                placeholder="e.g. Nguyen Van A"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-phone">Phone</Label>
              <Input
                id="add-phone"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="e.g. 0912 345 678"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="e.g. info@studio.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-website">Website</Label>
              <Input
                id="add-website"
                value={formWebsite}
                onChange={(e) => setFormWebsite(e.target.value)}
                placeholder="e.g. https://studio.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-notes">Notes</Label>
              <Textarea
                id="add-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Additional notes about this vendor..."
                rows={3}
              />
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={creating}>
              {creating ? "Creating..." : "Create Vendor"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
