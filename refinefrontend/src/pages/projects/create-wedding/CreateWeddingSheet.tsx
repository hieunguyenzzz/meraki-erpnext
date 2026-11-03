import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CoupleSection } from "./CoupleSection";
import { WeddingSection } from "./WeddingSection";
import { VenueSection } from "./VenueSection";
import { PriceSection } from "./PriceSection";
import { AddOnsSection } from "./AddOnsSection";
import { TeamSection } from "./TeamSection";
import { apiErrorMessage, initialFormData, type AddOnItem, type EmployeeOption, type FormData } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "New wedding" sheet: full-screen on phones, a right-hand panel on desktop. Posts to /inquiry-api/wedding/create. */
export function CreateWeddingSheet({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const [form, setForm] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const { result: venuesResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    filters: [{ field: "supplier_group", operator: "eq", value: "Wedding Venues" }],
    meta: { fields: ["name", "supplier_name"] },
    queryOptions: { enabled: open },
  });
  const venues = (venuesResult?.data ?? []) as { name: string; supplier_name: string }[];

  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "first_name", "last_name"] },
    queryOptions: { enabled: open },
  });
  const employees = (employeesResult?.data ?? []) as EmployeeOption[];

  const { result: customersResult } = useList({
    resource: "Customer",
    pagination: { mode: "off" },
    meta: { fields: ["name", "customer_name", "email_id"] },
    queryOptions: { enabled: open },
  });
  const customers = useMemo(
    () => (customersResult?.data ?? []) as { name: string; customer_name: string; email_id?: string }[],
    [customersResult]
  );

  // Add-on items come through the backend (ERPNext answers 403 to a direct Item read).
  const [addOnItems, setAddOnItems] = useState<AddOnItem[]>([]);
  const fetchAddonItems = useCallback(async () => {
    try {
      const res = await fetch("/inquiry-api/wedding/addon-items", { credentials: "include" });
      if (!res.ok) throw new Error(`addon-items returned ${res.status}`);
      const json = await res.json();
      setAddOnItems(json.data ?? []);
    } catch (err) {
      console.error("Load add-on items failed", err);
      setAddOnItems([]);
    }
  }, []);
  useEffect(() => {
    if (open) fetchAddonItems();
  }, [open, fetchAddonItems]);

  useEffect(() => {
    if (!open) {
      setForm(initialFormData);
      setError(null);
    }
  }, [open]);

  const update = (updates: Partial<FormData>) => setForm((prev) => ({ ...prev, ...updates }));

  const duplicateCustomer = useMemo(() => {
    const email = form.email.toLowerCase().trim();
    if (email.length < 3) return null;
    return customers.find((c) => c.email_id?.toLowerCase().trim() === email)?.customer_name ?? null;
  }, [form.email, customers]);

  const commissionBase = useMemo(() => {
    const addOnSum = form.addOns
      .filter((a) => a.itemCode && a.price && a.includeInCommission)
      .reduce((s, a) => s + parseFloat(a.price || "0"), 0);
    return parseFloat(form.packageAmount || "0") + addOnSum;
  }, [form.addOns, form.packageAmount]);

  const missing = [
    !form.coupleName.trim() && "couple name",
    !form.weddingDate && "wedding date",
    !form.weddingType && "wedding type",
    !form.leadPlanner && "lead planner",
  ].filter(Boolean) as string[];
  const canCreate = missing.length === 0 && !duplicateCustomer && !isSubmitting;

  const handleCreate = async () => {
    if (submittingRef.current || duplicateCustomer) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/inquiry-api/wedding/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couple_name: form.coupleName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          extra_emails: form.extraEmails.filter((e) => e.trim()),
          wedding_date: form.weddingDate,
          venue: form.venue.trim() || null,
          wedding_type: form.weddingType || null,
          package_amount: parseFloat(form.packageAmount) || 0,
          addons: form.addOns
            .filter((a) => a.itemCode && a.price)
            .map((a) => ({
              item_code: a.itemCode,
              item_name: a.itemName,
              rate: parseFloat(a.price),
              include_in_commission: a.includeInCommission,
            })),
          tax_type: form.taxType === "vat_included" ? "vat" : "none",
          lead_planner: form.leadPlanner || null,
          support_planner: form.supportPlanner && form.supportPlanner !== "__none__" ? form.supportPlanner : null,
          assistants: form.assistants.filter((a) => a && a !== "__none__"),
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(apiErrorMessage(body, "Failed to create wedding"));
      }

      const result = await resp.json();
      invalidate({ resource: "Project", invalidates: ["list"] });
      invalidate({ resource: "Sales Order", invalidates: ["list"] });
      invalidate({ resource: "Customer", invalidates: ["list"] });
      onOpenChange(false);
      navigate(`/projects/${result.project_name}`);
    } catch (err) {
      console.error("Create wedding failed", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <SheetContent
        side="right"
        aria-describedby="create-wedding-desc"
        className="flex w-full max-w-none flex-col gap-0 p-0 max-sm:rounded-l-none sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-16 sm:px-6">
          <SheetTitle className="font-display text-[28px] font-semibold leading-8 tracking-normal">New wedding</SheetTitle>
          <SheetDescription id="create-wedding-desc" className="sr-only">Enter the couple, date, venue, price and planning team.</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-input border border-destructive/30 bg-danger-soft p-3 text-sm text-danger-soft-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <CoupleSection form={form} onChange={update} duplicateCustomer={duplicateCustomer} />
            <WeddingSection form={form} onChange={update} />
            <VenueSection form={form} onChange={update} venues={venues} />
            <PriceSection form={form} onChange={update} commissionBase={commissionBase} />
            <AddOnsSection form={form} onChange={update} items={addOnItems} onItemsChanged={fetchAddonItems} />
            <TeamSection form={form} onChange={update} employees={employees} />
          </div>

          <SheetFooter className="shrink-0 flex-col gap-2 border-t bg-card px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:space-x-0 sm:px-6">
            {missing.length > 0 && (
              <p className="text-xs text-muted-foreground sm:mr-auto">Still needed: {missing.join(", ")}</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="button" className="flex-[2] sm:flex-none" onClick={handleCreate} disabled={!canCreate}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create wedding"
                )}
              </Button>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
