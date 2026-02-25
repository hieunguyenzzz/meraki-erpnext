import React, { useState, useEffect, useCallback } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import { useNavigate } from "react-router";
import {
  Users,
  Heart,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Loader2,
  Check,
  ChevronsUpDown,
  Plus,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { cn } from "@/lib/utils";
import { formatVND, formatDate } from "@/lib/format";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Wedding theme colors
const THEME = {
  cream: "#FDF8F3",
  blush: "#F5E6E0",
  rose: "#C9A9A6",
  sage: "#A8B5A0",
  gold: "#C4A962",
};

const SITE_NAME = "erp.merakiwp.com";

const STEPS = [
  { id: "client", title: "Client", icon: Users },
  { id: "wedding", title: "Wedding", icon: Heart },
  { id: "team", title: "Team", icon: UserPlus },
  { id: "review", title: "Review", icon: CheckCircle },
] as const;

type StepId = (typeof STEPS)[number]["id"];

interface AddOnRow {
  itemCode: string;
  itemName: string;
  price: string;
  includeInCommission: boolean;
}

interface FormData {
  // Client
  coupleName: string;
  email: string;
  phone: string;
  // Wedding
  weddingDate: string;
  venue: string;
  guestCount: string;
  packageAmount: string;
  taxType: "tax_free" | "vat_included";
  weddingType: "HCM" | "Destination" | "";
  extraEmails: string[];
  addOns: AddOnRow[];
  // Team
  leadPlanner: string;
  supportPlanner: string;
  assistants: string[];
}

const initialFormData: FormData = {
  coupleName: "",
  email: "",
  phone: "",
  extraEmails: [],
  weddingDate: "",
  venue: "",
  guestCount: "",
  packageAmount: "",
  taxType: "tax_free",
  weddingType: "",
  addOns: [],
  leadPlanner: "",
  supportPlanner: "",
  assistants: [],
};

interface CreateWeddingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWeddingDialog({
  open,
  onOpenChange,
}: CreateWeddingDialogProps) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { mutateAsync: createDoc } = useCreate();

  const [currentStep, setCurrentStep] = useState<StepId>("client");
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Venue combobox state
  const [venueOpen, setVenueOpen] = useState(false);
  const [venueSearch, setVenueSearch] = useState("");
  const [isCreatingVenue, setIsCreatingVenue] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  // venueDisplayName is the human-readable label; formData.venue is the Supplier document name (ID)
  const [venueDisplayName, setVenueDisplayName] = useState("");

  // Add-on row state: per-row search text and dropdown open flag
  const [addonSearchText, setAddonSearchText] = useState<string[]>([]);
  const [addonDropdownOpen, setAddonDropdownOpen] = useState<boolean[]>([]);
  const [isCreatingAddon, setIsCreatingAddon] = useState(false);
  const [addonCreateError, setAddonCreateError] = useState<string | null>(null);

  // Customer duplicate detection
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<{
    name: string;
    customer_name: string;
  } | null>(null);

  // Fetch venues (Supplier with group "Wedding Venues")
  const { result: venuesResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    filters: [{ field: "supplier_group", operator: "eq", value: "Wedding Venues" }],
    meta: { fields: ["name", "supplier_name"] },
  });
  const venues = (venuesResult?.data ?? []) as { name: string; supplier_name: string }[];

  // Fetch add-on items from ERPNext
  const { result: addOnItemsResult } = useList({
    resource: "Item",
    pagination: { mode: "off" },
    filters: [{ field: "item_group", operator: "eq", value: "Add-on Services" }],
    meta: { fields: ["name", "item_name", "custom_include_in_commission"] },
  });
  const addOnItems = (addOnItemsResult?.data ?? []) as {
    name: string;
    item_name: string;
    custom_include_in_commission: 0 | 1;
  }[];

  // Fetch active employees for team selection
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name"] },
  });
  const employees = (employeesResult?.data ?? []) as {
    name: string;
    employee_name: string;
  }[];

  // Fetch existing customers for duplicate check
  const { result: customersResult } = useList({
    resource: "Customer",
    pagination: { mode: "off" },
    meta: { fields: ["name", "customer_name", "email_id"] },
  });
  const customers = (customersResult?.data ?? []) as {
    name: string;
    customer_name: string;
    email_id?: string;
  }[];

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setFormData(initialFormData);
      setCurrentStep("client");
      setError(null);
      setFoundCustomer(null);
      setVenueSearch("");
      setVenueOpen(false);
      setVenueError(null);
      setVenueDisplayName("");
      setAddonSearchText([]);
      setAddonDropdownOpen([]);
      setAddonCreateError(null);
    }
  }, [open]);

  // Debounced email search for duplicate detection
  const searchCustomerByEmail = useCallback(
    (email: string) => {
      if (!email || email.length < 3) {
        setFoundCustomer(null);
        return;
      }

      setIsSearchingCustomer(true);
      const normalizedEmail = email.toLowerCase().trim();
      const match = customers.find(
        (c) => c.email_id?.toLowerCase().trim() === normalizedEmail
      );

      setFoundCustomer(match || null);
      setIsSearchingCustomer(false);
    },
    [customers]
  );

  // Handle email blur for duplicate detection
  const handleEmailBlur = () => {
    searchCustomerByEmail(formData.email);
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case "client":
        return formData.coupleName.trim().length > 0 && !foundCustomer;
      case "wedding":
        return formData.weddingDate.length > 0 && formData.weddingType !== "";
      case "team":
        return formData.leadPlanner.length > 0;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const handleCreate = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Create customer
      const customerResult = await createDoc({
        resource: "Customer",
        values: {
          customer_name: formData.coupleName.trim(),
          customer_type: "Individual",
          customer_group: "Wedding Clients",
          territory: "Vietnam",
          email_id: formData.email.trim() || undefined,
          mobile_no: formData.phone.trim() || undefined,
        },
      });
      const customerId = customerResult?.data?.name;
      if (!customerId) throw new Error("Failed to create customer");

      // 1b. Create Contact records for extra emails (non-blocking)
      const validExtraEmails = formData.extraEmails.filter((e) => e.trim());
      for (const extraEmail of validExtraEmails) {
        try {
          await createDoc({
            resource: "Contact",
            values: {
              first_name: formData.coupleName.trim(),
              email_ids: [{ email_id: extraEmail.trim(), is_primary: 0 }],
              links: [{ link_doctype: "Customer", link_name: customerId }],
            },
          });
        } catch {
          // Extra email contact creation is best-effort
        }
      }

      // 2. Create Sales Order (wedding booking)
      const today = new Date().toISOString().slice(0, 10);
      const commissionBase =
        parseFloat(formData.packageAmount || "0") +
        formData.addOns
          .filter((a) => a.itemCode && a.price && a.includeInCommission)
          .reduce((s, a) => s + parseFloat(a.price), 0);
      const salesOrderValues: Record<string, unknown> = {
        customer: customerId,
        transaction_date: today,
        delivery_date: formData.weddingDate,
        custom_venue: formData.venue.trim() || undefined,
        custom_wedding_type: formData.weddingType || undefined,
        custom_commission_base: commissionBase,
        items: [
          {
            item_code: "Wedding Planning Service",
            qty: 1,
            rate: parseFloat(formData.packageAmount) || 0,
          },
          ...formData.addOns
            .filter((a) => a.itemCode && a.price)
            .map((a) => ({
              item_code: a.itemCode,
              qty: 1,
              rate: parseFloat(a.price),
            })),
        ],
      };
      if (formData.taxType === "vat_included") {
        salesOrderValues.taxes = [
          {
            charge_type: "On Net Total",
            account_head: "Output Tax - MWP",
            rate: 8,
            included_in_print_rate: 1,
            description: "VAT 8%",
          },
        ];
      }
      const salesOrderResult = await createDoc({
        resource: "Sales Order",
        values: salesOrderValues,
      });
      const salesOrderName = salesOrderResult?.data?.name;
      if (!salesOrderName) throw new Error("Failed to create sales order");

      // 3. Submit Sales Order (fetch full doc first to avoid TimestampMismatchError)
      const fullDocRes = await fetch(
        `/api/resource/Sales Order/${encodeURIComponent(salesOrderName)}`,
        {
          headers: { "X-Frappe-Site-Name": SITE_NAME },
          credentials: "include",
        }
      );
      const fullDocData = await fullDocRes.json();
      const submitRes = await fetch("/api/method/frappe.client.submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-Site-Name": SITE_NAME,
        },
        credentials: "include",
        body: JSON.stringify({ doc: fullDocData.data }),
      });
      if (!submitRes.ok) {
        const errorText = await submitRes.text();
        throw new Error(`Failed to submit sales order: ${errorText}`);
      }

      // 3b. Mark sales order as fully delivered
      await fetch("/api/method/frappe.client.set_value", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-Site-Name": SITE_NAME,
        },
        credentials: "include",
        body: JSON.stringify({
          doctype: "Sales Order",
          name: salesOrderName,
          fieldname: "per_delivered",
          value: 100,
        }),
      });

      // 4. Create Project linked to Sales Order with team assignment
      const projectResult = await createDoc({
        resource: "Project",
        values: {
          project_name: `${formData.coupleName.trim()} Wedding`,
          expected_end_date: formData.weddingDate,
          sales_order: salesOrderName,
          customer: customerId,
          custom_project_stage: formData.weddingDate < new Date().toISOString().slice(0, 10) ? "Completed" : "Onboarding",
          custom_lead_planner: formData.leadPlanner || null,
          custom_support_planner: formData.supportPlanner && formData.supportPlanner !== "__none__" ? formData.supportPlanner : null,
          ...(() => {
            const validAssistants = formData.assistants.filter((a) => a && a !== "__none__");
            return {
              custom_assistant_1: validAssistants[0] ?? null,
              custom_assistant_2: validAssistants[1] ?? null,
              custom_assistant_3: validAssistants[2] ?? null,
              custom_assistant_4: validAssistants[3] ?? null,
              custom_assistant_5: validAssistants[4] ?? null,
            };
          })(),
        },
      });
      const projectName = projectResult?.data?.name;
      if (!projectName) throw new Error("Failed to create project");

      // Success - invalidate and navigate
      invalidate({ resource: "Project", invalidates: ["list"] });
      invalidate({ resource: "Sales Order", invalidates: ["list"] });
      invalidate({ resource: "Customer", invalidates: ["list"] });

      onOpenChange(false);
      navigate(`/projects/${projectName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleCreateVenue = async (venueName: string) => {
    setIsCreatingVenue(true);
    setVenueError(null);
    try {
      const result = await createDoc({
        resource: "Supplier",
        values: {
          supplier_name: venueName,
          supplier_group: "Wedding Venues",
          supplier_type: "Company",
        },
      });
      // Store document name (ID) for the Link field, display supplier_name for UI
      const supplierId = result?.data?.name ?? venueName;
      const displayName = result?.data?.supplier_name ?? venueName;
      updateFormData({ venue: supplierId });
      setVenueDisplayName(displayName);
      setVenueOpen(false);
      setVenueSearch("");
    } catch (err: any) {
      const msg = err?.message || "Failed to create venue";
      setVenueError(`Could not create venue: ${msg}`);
      // Do NOT set venue — leave it empty so Sales Order won't fail
    } finally {
      setIsCreatingVenue(false);
    }
  };

  const handleCreateAddon = async (rowIndex: number, name: string, includeInCommission: boolean) => {
    if (!name.trim()) return;
    setIsCreatingAddon(true);
    setAddonCreateError(null);
    try {
      const resp = await fetch("/inquiry-api/wedding/addon-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item_name: name.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const detail = err.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : detail || "Failed to create add-on";
        throw new Error(msg);
      }
      const item = await resp.json();
      const itemCode = item.name ?? name;
      const itemName = item.item_name ?? name;
      const updated = formData.addOns.map((a, i) =>
        i === rowIndex ? { ...a, itemCode, itemName, includeInCommission } : a
      );
      updateFormData({ addOns: updated });
      const newSearch = [...addonSearchText];
      newSearch[rowIndex] = itemName;
      setAddonSearchText(newSearch);
      const newOpen = [...addonDropdownOpen];
      newOpen[rowIndex] = false;
      setAddonDropdownOpen(newOpen);
    } catch (err: any) {
      setAddonCreateError(err?.message || "Failed to create add-on");
    } finally {
      setIsCreatingAddon(false);
    }
  };

  const selectAddonItem = (rowIndex: number, item: { name: string; item_name: string; custom_include_in_commission: 0 | 1 }) => {
    const updated = formData.addOns.map((a, i) =>
      i === rowIndex
        ? { ...a, itemCode: item.name, itemName: item.item_name, includeInCommission: item.custom_include_in_commission === 1 }
        : a
    );
    updateFormData({ addOns: updated });
    const newSearch = [...addonSearchText];
    newSearch[rowIndex] = item.item_name;
    setAddonSearchText(newSearch);
    const newOpen = [...addonDropdownOpen];
    newOpen[rowIndex] = false;
    setAddonDropdownOpen(newOpen);
  };

  const getFilteredAddons = (rowIndex: number) => {
    const search = (addonSearchText[rowIndex] ?? "").toLowerCase();
    if (!search) return addOnItems;
    return addOnItems.filter((item) =>
      item.item_name.toLowerCase().includes(search)
    );
  };

  const getAddonCommissionBase = () => {
    const pkg = parseFloat(formData.packageAmount || "0");
    const addOnSum = formData.addOns
      .filter((a) => a.itemCode && a.price && a.includeInCommission)
      .reduce((s, a) => s + parseFloat(a.price || "0"), 0);
    return pkg + addOnSum;
  };

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.name === employeeId);
    return emp?.employee_name || employeeId;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle
            className="text-2xl"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Create New Wedding
          </SheetTitle>

          {/* Step Indicator */}
          <div className="flex items-center justify-center py-4">
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = step.id === currentStep;
              const Icon = step.icon;

              return (
                <div key={step.id} className="flex items-center">
                  {/* Step circle */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                        isCompleted && "bg-[#C4A962] border-[#C4A962] text-white",
                        isCurrent && "border-[#C4A962] text-[#C4A962]",
                        !isCompleted &&
                          !isCurrent &&
                          "border-muted-foreground/30 text-muted-foreground/50"
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs mt-1.5 font-medium",
                        isCurrent ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {step.title}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "w-12 h-0.5 mx-2 mb-6",
                        index < currentStepIndex
                          ? "bg-[#C4A962]"
                          : "bg-muted-foreground/20"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Client */}
          {currentStep === "client" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="couple-name" className="text-muted-foreground">
                  Couple Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="couple-name"
                  placeholder="e.g. John & Jane Smith"
                  value={formData.coupleName}
                  onChange={(e) =>
                    updateFormData({ coupleName: e.target.value })
                  }
                  className="focus-visible:ring-[#C4A962]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => updateFormData({ email: e.target.value })}
                    onBlur={handleEmailBlur}
                    className="focus-visible:ring-[#C4A962]"
                  />
                  {isSearchingCustomer && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Duplicate email error */}
              {foundCustomer && (
                <p className="text-sm text-destructive">
                  This email is already used by <strong>{foundCustomer.customer_name}</strong>. Please use a different email.
                </p>
              )}

              {/* Extra email rows */}
              {formData.extraEmails.map((email, i) => (
                <div key={i} className="space-y-2">
                  <Label className="text-muted-foreground">Email {i + 2}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Additional email"
                      value={email}
                      onChange={(e) => {
                        const updated = [...formData.extraEmails];
                        updated[i] = e.target.value;
                        updateFormData({ extraEmails: updated });
                      }}
                      className="focus-visible:ring-[#C4A962]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateFormData({
                          extraEmails: formData.extraEmails.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => updateFormData({ extraEmails: [...formData.extraEmails, ""] })}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                <Plus className="h-4 w-4" />
                Add another email
              </button>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-muted-foreground">
                  Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+84 123 456 789"
                  value={formData.phone}
                  onChange={(e) => updateFormData({ phone: e.target.value })}
                  className="focus-visible:ring-[#C4A962]"
                />
              </div>
            </div>
          )}

          {/* Step 2: Wedding */}
          {currentStep === "wedding" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wedding-date" className="text-muted-foreground">
                  Wedding Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wedding-date"
                  type="date"
                  value={formData.weddingDate}
                  onChange={(e) =>
                    updateFormData({ weddingDate: e.target.value })
                  }
                  className="focus-visible:ring-[#C4A962]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Venue</Label>
                <Popover open={venueOpen} onOpenChange={setVenueOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={venueOpen}
                      className={cn(
                        "w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                        "border-input bg-background hover:border-[#C4A962]/50 focus:outline-none",
                        !formData.venue && "text-muted-foreground"
                      )}
                    >
                      {venueDisplayName || formData.venue || "Search or create venue..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search venues..."
                        value={venueSearch}
                        onValueChange={(v) => { setVenueSearch(v); setVenueError(null); }}
                      />
                      <CommandList>
                        <CommandEmpty>No venues found.</CommandEmpty>
                        <CommandGroup>
                          {venues.map((v) => (
                            <CommandItem
                              key={v.name}
                              value={v.supplier_name}
                              onSelect={() => {
                                updateFormData({ venue: v.name });
                                setVenueDisplayName(v.supplier_name);
                                setVenueOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.venue === v.name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {v.supplier_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {venueSearch.length > 1 && !venues.some(
                          (v) => v.supplier_name.toLowerCase() === venueSearch.toLowerCase()
                        ) && (
                          <CommandGroup>
                            <CommandItem
                              value={`__create__${venueSearch}`}
                              onSelect={() => handleCreateVenue(venueSearch)}
                              disabled={isCreatingVenue}
                            >
                              {isCreatingVenue ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="mr-2 h-4 w-4" />
                              )}
                              Create "{venueSearch}"
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              {venueError && (
                <p className="text-xs text-destructive mt-1">{venueError}</p>
              )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="guest-count"
                    className="text-muted-foreground"
                  >
                    Guest Count
                  </Label>
                  <Input
                    id="guest-count"
                    type="number"
                    placeholder="100"
                    value={formData.guestCount}
                    onChange={(e) =>
                      updateFormData({ guestCount: e.target.value })
                    }
                    className="focus-visible:ring-[#C4A962]"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="package-amount"
                    className="text-muted-foreground"
                  >
                    Package Amount (VND)
                  </Label>
                  <Input
                    id="package-amount"
                    type="number"
                    placeholder="50000000"
                    value={formData.packageAmount}
                    onChange={(e) =>
                      updateFormData({ packageAmount: e.target.value })
                    }
                    className="focus-visible:ring-[#C4A962]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Tax</Label>
                <div className="flex gap-3">
                  {[
                    { value: "tax_free", label: "Tax Free" },
                    { value: "vat_included", label: "VAT Included (8%)" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateFormData({
                          taxType: opt.value as FormData["taxType"],
                        })
                      }
                      className={cn(
                        "flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all",
                        formData.taxType === opt.value
                          ? "border-[#C4A962] bg-[#C4A962]/10 text-[#C4A962]"
                          : "border-border text-muted-foreground hover:border-[#C4A962]/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  Wedding Type <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-3">
                  {[
                    { value: "HCM", label: "HCM" },
                    { value: "Destination", label: "Destination" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateFormData({
                          weddingType: opt.value as FormData["weddingType"],
                        })
                      }
                      className={cn(
                        "flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all",
                        formData.weddingType === opt.value
                          ? "border-[#C4A962] bg-[#C4A962]/10 text-[#C4A962]"
                          : "border-border text-muted-foreground hover:border-[#C4A962]/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add-ons */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Add-ons</Label>
                {formData.addOns.map((addon, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    {/* Name input + dropdown */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Add-on name..."
                        value={addonSearchText[i] ?? addon.itemName}
                        onChange={(e) => {
                          const newSearch = [...addonSearchText];
                          newSearch[i] = e.target.value;
                          setAddonSearchText(newSearch);
                          // Clear selection if user edits text
                          const updated = formData.addOns.map((a, j) =>
                            j === i ? { ...a, itemCode: "", itemName: e.target.value } : a
                          );
                          updateFormData({ addOns: updated });
                        }}
                        onFocus={() => {
                          const newOpen = [...addonDropdownOpen];
                          newOpen[i] = true;
                          setAddonDropdownOpen(newOpen);
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            const newOpen = [...addonDropdownOpen];
                            newOpen[i] = false;
                            setAddonDropdownOpen(newOpen);
                          }, 200);
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C4A962]"
                      />
                      {addonDropdownOpen[i] && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {getFilteredAddons(i).map((item) => (
                            <div
                              key={item.name}
                              onMouseDown={(e) => { e.preventDefault(); selectAddonItem(i, item); }}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2"
                            >
                              {item.name === addon.itemCode && <Check className="h-3 w-3 text-[#C4A962]" />}
                              {item.item_name}
                            </div>
                          ))}
                          {(addonSearchText[i] ?? "").length > 0 &&
                            !addOnItems.some((item) => item.item_name.toLowerCase() === (addonSearchText[i] ?? "").toLowerCase()) && (
                            <div
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleCreateAddon(i, addonSearchText[i] ?? "", addon.includeInCommission);
                              }}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2 text-[#C4A962]"
                            >
                              {isCreatingAddon ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              Create "{addonSearchText[i]}"
                            </div>
                          )}
                          {addOnItems.length === 0 && (addonSearchText[i] ?? "").length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No add-ons yet. Type to create.</div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Price */}
                    <input
                      type="number"
                      placeholder="Price VND"
                      value={addon.price}
                      onChange={(e) => {
                        const updated = formData.addOns.map((a, j) =>
                          j === i ? { ...a, price: e.target.value } : a
                        );
                        updateFormData({ addOns: updated });
                      }}
                      className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C4A962]"
                    />
                    {/* Commission checkbox */}
                    <label className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addon.includeInCommission}
                        onChange={(e) => {
                          const updated = formData.addOns.map((a, j) =>
                            j === i ? { ...a, includeInCommission: e.target.checked } : a
                          );
                          updateFormData({ addOns: updated });
                        }}
                        className="accent-[#C4A962]"
                      />
                      Commission
                    </label>
                    {/* Remove */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        updateFormData({ addOns: formData.addOns.filter((_, j) => j !== i) });
                        setAddonSearchText((prev) => prev.filter((_, j) => j !== i));
                        setAddonDropdownOpen((prev) => prev.filter((_, j) => j !== i));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {addonCreateError && (
                  <p className="text-xs text-destructive">{addonCreateError}</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    updateFormData({ addOns: [...formData.addOns, { itemCode: "", itemName: "", price: "", includeInCommission: false }] });
                    setAddonSearchText((prev) => [...prev, ""]);
                    setAddonDropdownOpen((prev) => [...prev, false]);
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Add-on
                </button>
                {/* Commission base summary */}
                {formData.addOns.length > 0 && formData.packageAmount && (
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    Commission base:{" "}
                    {formatVND(parseFloat(formData.packageAmount || "0"))}
                    {formData.addOns.filter((a) => a.includeInCommission && a.price).map((a, i) => (
                      <span key={i}> + {formatVND(parseFloat(a.price || "0"))}</span>
                    ))}
                    {" = "}
                    <span className="font-medium text-foreground">{formatVND(getAddonCommissionBase())}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Team */}
          {currentStep === "team" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lead-planner" className="text-muted-foreground">
                  Lead Planner <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.leadPlanner}
                  onValueChange={(value) =>
                    updateFormData({ leadPlanner: value })
                  }
                >
                  <SelectTrigger
                    id="lead-planner"
                    className="focus:ring-[#C4A962]"
                  >
                    <SelectValue placeholder="Select lead planner" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.name} value={emp.name}>
                        {emp.employee_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="support-planner"
                  className="text-muted-foreground"
                >
                  Support Planner
                </Label>
                <Select
                  value={formData.supportPlanner}
                  onValueChange={(value) =>
                    updateFormData({ supportPlanner: value })
                  }
                >
                  <SelectTrigger
                    id="support-planner"
                    className="focus:ring-[#C4A962]"
                  >
                    <SelectValue placeholder="Select support planner (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {employees
                      .filter((emp) => emp.name !== formData.leadPlanner)
                      .map((emp) => (
                        <SelectItem key={emp.name} value={emp.name}>
                          {emp.employee_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assistants — dynamic */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Assistants</Label>
                {formData.assistants.map((asst, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select
                      value={asst}
                      onValueChange={(v) => {
                        const updated = [...formData.assistants];
                        updated[i] = v;
                        updateFormData({ assistants: updated });
                      }}
                    >
                      <SelectTrigger className="focus:ring-[#C4A962]">
                        <SelectValue placeholder="Select assistant" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees
                          .filter(
                            (emp) =>
                              emp.name !== formData.leadPlanner &&
                              emp.name !== formData.supportPlanner &&
                              !formData.assistants.some((a, j) => j !== i && a === emp.name)
                          )
                          .map((emp) => (
                            <SelectItem key={emp.name} value={emp.name}>
                              {emp.employee_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateFormData({
                          assistants: formData.assistants.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {formData.assistants.length < 5 && (
                  <button
                    type="button"
                    onClick={() => updateFormData({ assistants: [...formData.assistants, ""] })}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add assistant
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === "review" && (
            <div
              className="rounded-lg border p-5 space-y-4"
              style={{ backgroundColor: THEME.cream }}
            >
              <h3
                className="text-lg font-semibold"
                style={{ fontFamily: "Georgia, serif" }}
              >
                Review Details
              </h3>

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {/* Client */}
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Client
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Name:</span>
                </div>
                <div className="font-medium">
                  {formData.coupleName}
                </div>
                {formData.email && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                    </div>
                    <div>{formData.email}</div>
                  </>
                )}
                {formData.extraEmails.filter(Boolean).map((e, i) => (
                  <React.Fragment key={i}>
                    <div><span className="text-muted-foreground">Email {i + 2}:</span></div>
                    <div>{e}</div>
                  </React.Fragment>
                ))}
                {formData.phone && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>
                    </div>
                    <div>{formData.phone}</div>
                  </>
                )}

                {/* Wedding */}
                <div className="col-span-2 pt-3 border-t mt-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Wedding
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                </div>
                <div className="font-medium" style={{ color: THEME.gold }}>
                  {formatDate(formData.weddingDate)}
                </div>
                {formData.venue && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Venue:</span>
                    </div>
                    <div>{venueDisplayName || formData.venue}</div>
                  </>
                )}
                {formData.guestCount && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Guests:</span>
                    </div>
                    <div>{formData.guestCount}</div>
                  </>
                )}
                {formData.packageAmount && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Package:</span>
                    </div>
                    <div>{formatVND(parseFloat(formData.packageAmount))}</div>
                  </>
                )}
                <div>
                  <span className="text-muted-foreground">Tax:</span>
                </div>
                <div>
                  {formData.taxType === "vat_included"
                    ? "VAT Included (8%)"
                    : "Tax Free"}
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>
                </div>
                <div>{formData.weddingType || "—"}</div>

                {/* Add-ons */}
                {formData.addOns.filter((a) => a.itemName).length > 0 && (
                  <>
                    <div className="col-span-2 pt-1">
                      <span className="text-muted-foreground">Add-ons:</span>
                    </div>
                    <div className="col-span-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-normal pb-1">Name</th>
                            <th className="text-right font-normal pb-1">Price</th>
                            <th className="text-right font-normal pb-1">Commission</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.addOns.filter((a) => a.itemName).map((a, i) => (
                            <tr key={i}>
                              <td>{a.itemName}</td>
                              <td className="text-right">{a.price ? formatVND(parseFloat(a.price)) : "—"}</td>
                              <td className="text-right">{a.includeInCommission ? "✓" : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div><span className="text-muted-foreground">Commission Base:</span></div>
                    <div className="font-medium" style={{ color: THEME.gold }}>{formatVND(getAddonCommissionBase())}</div>
                  </>
                )}

                {/* Team */}
                <div className="col-span-2 pt-3 border-t mt-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Team
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Lead Planner:</span>
                </div>
                <div className="font-medium">
                  {getEmployeeName(formData.leadPlanner)}
                </div>
                {formData.supportPlanner && formData.supportPlanner !== "__none__" && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Support:</span>
                    </div>
                    <div>{getEmployeeName(formData.supportPlanner)}</div>
                  </>
                )}
                {formData.assistants.filter(Boolean).map((asst, i) => (
                  <React.Fragment key={i}>
                    <div><span className="text-muted-foreground">Assistant {i + 1}:</span></div>
                    <div>{getEmployeeName(asst)}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t shrink-0 flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0 || isSubmitting}
          >
            Back
          </Button>

          {currentStep === "review" ? (
            <Button
              onClick={handleCreate}
              disabled={isSubmitting}
              style={{ backgroundColor: THEME.gold }}
              className="hover:opacity-90 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Wedding"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              style={{ backgroundColor: THEME.gold }}
              className="hover:opacity-90 text-white"
            >
              Next
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
