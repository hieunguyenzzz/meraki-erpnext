import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

interface FormData {
  // Client
  coupleName: string;
  email: string;
  phone: string;
  useExistingCustomer: boolean;
  existingCustomerId: string | null;
  existingCustomerName: string | null;
  // Wedding
  weddingDate: string;
  venue: string;
  guestCount: string;
  packageAmount: string;
  // Team
  leadPlanner: string;
  supportPlanner: string;
  assistant1: string;
  assistant2: string;
}

const initialFormData: FormData = {
  coupleName: "",
  email: "",
  phone: "",
  useExistingCustomer: false,
  existingCustomerId: null,
  existingCustomerName: null,
  weddingDate: "",
  venue: "",
  guestCount: "",
  packageAmount: "",
  leadPlanner: "",
  supportPlanner: "",
  assistant1: "",
  assistant2: "",
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

  // Customer duplicate detection
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<{
    name: string;
    customer_name: string;
  } | null>(null);

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
        return formData.coupleName.trim().length > 0;
      case "wedding":
        return formData.weddingDate.length > 0;
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
      // 1. Create or use existing customer
      let customerId: string;
      if (formData.useExistingCustomer && formData.existingCustomerId) {
        customerId = formData.existingCustomerId;
      } else {
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
        customerId = customerResult?.data?.name;
        if (!customerId) throw new Error("Failed to create customer");
      }

      // 2. Create Sales Order (wedding booking)
      const today = new Date().toISOString().slice(0, 10);
      const salesOrderResult = await createDoc({
        resource: "Sales Order",
        values: {
          customer: customerId,
          transaction_date: today,
          delivery_date: formData.weddingDate,
          custom_venue: formData.venue.trim() || undefined,
          items: [
            {
              item_code: "Wedding Planning Service",
              qty: 1,
              rate: parseFloat(formData.packageAmount) || 0,
            },
          ],
        },
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

      // 4. Create Project linked to Sales Order with team assignment
      const projectResult = await createDoc({
        resource: "Project",
        values: {
          project_name: `${formData.coupleName.trim()} Wedding`,
          project_type: "External",
          expected_end_date: formData.weddingDate,
          sales_order: salesOrderName,
          customer: customerId,
          custom_project_stage: "Onboarding",
          custom_lead_planner: formData.leadPlanner || null,
          custom_support_planner: formData.supportPlanner && formData.supportPlanner !== "__none__" ? formData.supportPlanner : null,
          custom_assistant_1: formData.assistant1 && formData.assistant1 !== "__none__" ? formData.assistant1 : null,
          custom_assistant_2: formData.assistant2 && formData.assistant2 !== "__none__" ? formData.assistant2 : null,
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

  const handleLinkExistingCustomer = () => {
    if (foundCustomer) {
      updateFormData({
        useExistingCustomer: true,
        existingCustomerId: foundCustomer.name,
        existingCustomerName: foundCustomer.customer_name,
      });
    }
  };

  const handleCreateNewAnyway = () => {
    setFoundCustomer(null);
    updateFormData({
      useExistingCustomer: false,
      existingCustomerId: null,
      existingCustomerName: null,
    });
  };

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.name === employeeId);
    return emp?.employee_name || employeeId;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle
            className="text-2xl"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Create New Wedding
          </DialogTitle>
          <DialogDescription>
            Add a new wedding client and booking to the system
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center py-6">
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

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="min-h-[280px]">
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

              {/* Duplicate customer warning */}
              {foundCustomer && !formData.useExistingCustomer && (
                <div
                  className="p-4 rounded-lg border"
                  style={{ backgroundColor: THEME.cream }}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      className="h-5 w-5 shrink-0 mt-0.5"
                      style={{ color: THEME.gold }}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        Existing customer found
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        "{foundCustomer.customer_name}" already exists with this
                        email.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleLinkExistingCustomer}
                          style={{
                            backgroundColor: THEME.gold,
                            color: "white",
                          }}
                          className="hover:opacity-90"
                        >
                          Link to existing
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleCreateNewAnyway}
                        >
                          Create new anyway
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked customer confirmation */}
              {formData.useExistingCustomer && formData.existingCustomerName && (
                <div
                  className="p-4 rounded-lg border"
                  style={{ backgroundColor: THEME.cream }}
                >
                  <div className="flex items-center gap-3">
                    <Check
                      className="h-5 w-5 shrink-0"
                      style={{ color: THEME.sage }}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        Linking to existing customer
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formData.existingCustomerName}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleCreateNewAnyway}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              )}

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
                <Label htmlFor="venue" className="text-muted-foreground">
                  Venue
                </Label>
                <Input
                  id="venue"
                  placeholder="e.g. The Grand Ballroom"
                  value={formData.venue}
                  onChange={(e) => updateFormData({ venue: e.target.value })}
                  className="focus-visible:ring-[#C4A962]"
                />
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="assistant1" className="text-muted-foreground">
                    Assistant 1
                  </Label>
                  <Select
                    value={formData.assistant1}
                    onValueChange={(value) =>
                      updateFormData({ assistant1: value })
                    }
                  >
                    <SelectTrigger
                      id="assistant1"
                      className="focus:ring-[#C4A962]"
                    >
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {employees
                        .filter(
                          (emp) =>
                            emp.name !== formData.leadPlanner &&
                            emp.name !== formData.supportPlanner
                        )
                        .map((emp) => (
                          <SelectItem key={emp.name} value={emp.name}>
                            {emp.employee_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assistant2" className="text-muted-foreground">
                    Assistant 2
                  </Label>
                  <Select
                    value={formData.assistant2}
                    onValueChange={(value) =>
                      updateFormData({ assistant2: value })
                    }
                  >
                    <SelectTrigger
                      id="assistant2"
                      className="focus:ring-[#C4A962]"
                    >
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {employees
                        .filter(
                          (emp) =>
                            emp.name !== formData.leadPlanner &&
                            emp.name !== formData.supportPlanner &&
                            emp.name !== formData.assistant1
                        )
                        .map((emp) => (
                          <SelectItem key={emp.name} value={emp.name}>
                            {emp.employee_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  {formData.useExistingCustomer
                    ? formData.existingCustomerName
                    : formData.coupleName}
                  {formData.useExistingCustomer && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (existing)
                    </span>
                  )}
                </div>
                {formData.email && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                    </div>
                    <div>{formData.email}</div>
                  </>
                )}
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
                    <div>{formData.venue}</div>
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
                {formData.assistant1 && formData.assistant1 !== "__none__" && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Assistant 1:</span>
                    </div>
                    <div>{getEmployeeName(formData.assistant1)}</div>
                  </>
                )}
                {formData.assistant2 && formData.assistant2 !== "__none__" && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Assistant 2:</span>
                    </div>
                    <div>{getEmployeeName(formData.assistant2)}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-between pt-4 border-t">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
