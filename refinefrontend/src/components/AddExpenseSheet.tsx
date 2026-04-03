import { useState, useEffect, useMemo, useRef } from "react";
import { useList, useInvalidate, usePermissions } from "@refinedev/core";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { hasModuleAccess, FINANCE_ROLES } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Loader2, X } from "lucide-react";

interface AddExpenseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExpenseCategory {
  name: string;
  account_name: string;
}

const today = () => new Date().toISOString().split("T")[0];

const initialForm = {
  project: "",
  date: today(),
  category: "",
  amount: "",
  description: "",
};

export function AddExpenseSheet({ open, onOpenChange }: AddExpenseSheetProps) {
  const { employeeId } = useMyEmployee();
  const invalidate = useInvalidate();
  const { data: roles } = usePermissions<string[]>({});
  const isFinance = hasModuleAccess(roles ?? [], FINANCE_ROLES);

  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<File | null>(null);

  const ASSIGNMENT_FIELDS = [
    "custom_lead_planner", "custom_support_planner",
    "custom_assistant_1", "custom_assistant_2", "custom_assistant_3",
    "custom_assistant_4", "custom_assistant_5",
  ] as const;

  // Fetch open projects with assignment fields
  const { result: projectsResult } = useList<Record<string, string>>({
    resource: "Project",
    filters: [{ field: "status", operator: "eq", value: "Open" }],
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "project_name", "status", ...ASSIGNMENT_FIELDS],
    },
  });
  const allProjects = (projectsResult?.data ?? []) as Record<string, string>[];

  // Finance sees all projects; staff sees only their assigned weddings
  const projects = useMemo(() => {
    if (isFinance) return allProjects;
    if (!employeeId) return [];
    return allProjects.filter((p) =>
      ASSIGNMENT_FIELDS.some((f) => p[f] === employeeId)
    );
  }, [allProjects, employeeId, isFinance]);

  // Fetch expense categories
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/inquiry-api/expense/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, [open]);

  function resetForm() {
    setForm({ ...initialForm, date: today() });
    setPhoto(null);
    photoRef.current = null;
    setPhotoPreview(null);
    setError(null);
    setSuccess(null);
    setIsScanning(false);
  }

  function handleOpenChange(open: boolean) {
    onOpenChange(open);
    if (!open) resetForm();
  }

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    photoRef.current = file;
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhoto(null);
    photoRef.current = null;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleScanBill() {
    if (!photo) return;
    setIsScanning(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", photo);

      const res = await fetch("/inquiry-api/expense/scan-bill", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to scan bill");
      }

      const result = await res.json();

      setForm((prev) => ({
        ...prev,
        amount: result.amount != null ? String(Math.round(result.amount)) : prev.amount,
        description: result.description ?? prev.description,
        date: result.date ?? prev.date,
        category: result.category ?? prev.category,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to scan bill";
      setError(message);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project || !form.date || !form.category || !form.amount || !form.description) {
      setError("Please fill in all required fields");
      return;
    }

    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    // Use ref (immune to React state resets) with fallbacks
    const capturedPhoto = photoRef.current ?? photo ?? fileInputRef.current?.files?.[0] ?? null;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/inquiry-api/expense/wedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: form.project,
          date: form.date,
          description: form.description,
          amount,
          category: form.category,
          staff: employeeId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to create expense");
      }

      const result = await res.json();

      // Attach photo — use the file captured before any async work
      let photoStatus = `ref=${!!photoRef.current} state=${!!photo} input=${fileInputRef.current?.files?.length ?? 0}`;
      if (capturedPhoto && result.name) {
        try {
          const attachForm = new FormData();
          attachForm.append("file", capturedPhoto);
          const attachRes = await fetch(`/inquiry-api/expense/${result.name}/attach`, {
            method: "POST",
            body: attachForm,
          });
          photoStatus = attachRes.ok ? "Photo attached" : `Attach failed: ${attachRes.status}`;
        } catch (err: unknown) {
          photoStatus = `Attach error: ${err instanceof Error ? err.message : "unknown"}`;
        }
      }

      setSuccess(`Expense submitted. [Debug: ${photoStatus}]`);
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });

      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create expense";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>Add Expense</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {success}
              </div>
            )}

            {/* Wedding / Project */}
            <div>
              <Label>Wedding *</Label>
              <Select
                value={form.project}
                onValueChange={(v) => setForm((prev) => ({ ...prev, project: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wedding" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.project_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bill Photo (optional) */}
            <div>
              <Label>Bill Photo <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoCapture}
                className="hidden"
              />

              {photoPreview ? (
                <div className="mt-2 relative">
                  <img
                    src={photoPreview}
                    alt="Bill preview"
                    className="w-full max-h-48 object-contain rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Take or Choose Photo
                </Button>
              )}

              {photo && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={handleScanBill}
                  disabled={isScanning}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reading bill...
                    </>
                  ) : (
                    "Scan Bill"
                  )}
                </Button>
              )}
            </div>

            {/* Date */}
            <div>
              <Label htmlFor="expense_date">Date *</Label>
              <Input
                id="expense_date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>

            {/* Category */}
            <div>
              <Label>Category *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div>
              <Label htmlFor="expense_amount">Amount (VND) *</Label>
              <div className="flex gap-2">
                <Input
                  id="expense_amount"
                  type="number"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="0"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 font-mono text-sm px-3"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      amount: (prev.amount || "0") + "000",
                    }))
                  }
                >
                  000
                </Button>
              </div>
              {form.amount && !isNaN(Number(form.amount)) && Number(form.amount) >= 1000 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {Number(form.amount).toLocaleString("vi-VN")} VND
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="expense_description">Description *</Label>
              <Input
                id="expense_description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="What was this expense for?"
              />
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Expense"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
