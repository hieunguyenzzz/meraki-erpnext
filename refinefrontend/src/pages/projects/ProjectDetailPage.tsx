import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useOne, useList, useUpdate, useInvalidate, useNavigation, usePermissions } from "@refinedev/core";
import * as Popover from "@radix-ui/react-popover";
import { formatDate, formatVND, displayName } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Plus,
  Check,
  User,
  Clock,
  AlertCircle,
  Loader2,
  Pencil,
  ChevronsUpDown,
  X,
  Camera,
  Paperclip,
} from "lucide-react";
import {
  Popover as ShadcnPopover,
  PopoverContent as ShadcnPopoverContent,
  PopoverTrigger as ShadcnPopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/fileUpload";
import { hasModuleAccess, FINANCE_ROLES, WEDDING_MANAGER_ROLES } from "@/lib/roles";
interface ExpenseCategory { name: string; account_name: string; }
import { useMyEmployee } from "@/hooks/useMyEmployee";


const WEDDING_PHASES = [
  "Onboarding",
  "Planning",
  "Final Details",
  "Wedding Week",
  "Day-of",
  "Completed",
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

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

function stageBadgeVariant(stage: string) {
  switch (stage) {
    case "Onboarding": return "info" as const;
    case "Planning": return "warning" as const;
    case "Final Details": return "info" as const;
    case "Wedding Week": return "destructive" as const;
    case "Day-of": return "secondary" as const;
    case "Completed": return "success" as const;
    default: return "secondary" as const;
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "Open": return "warning" as const;
    case "Completed": return "success" as const;
    case "Cancelled": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    subject: "",
    phase: "",
    deadline: "",
    priority: "Medium",
    assignee: "",
  });
  const [sharedWith, setSharedWith] = useState<Set<string>>(new Set());

  // Payment milestone state
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [isSubmittingMilestone, setIsSubmittingMilestone] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({
    label: "",
    amount: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
  });

  // Edit state - per-section sheets
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editStaffOpen, setEditStaffOpen] = useState(false);
  const [editSalesOpen, setEditSalesOpen] = useState(false);
  const [salesForm, setSalesForm] = useState({ salesPerson: "", bookingDate: "" });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editVenueOpen, setEditVenueOpen] = useState(false);
  const [editVenueSearch, setEditVenueSearch] = useState("");
  const [editVenueDisplayName, setEditVenueDisplayName] = useState("");
  const [editForm, setEditForm] = useState({
    weddingDate: "",
    venue: "",
    packageAmount: "",
    totalBudget: "",
    leadPlanner: "",
    supportPlanner: "",
    assistant1: "",
    assistant2: "",
    assistant3: "",
    assistant4: "",
    assistant5: "",
    leadCommissionPct: "",
    supportCommissionPct: "",
    assistantCommissionPct: "",
    addOns: [] as { itemCode: string; itemName: string; qty: number; rate: number; includeInCommission: boolean }[],
    taxType: "tax_free" as "tax_free" | "vat_included",
    serviceType: "" as string,
  });
  const [editAddonSearch, setEditAddonSearch] = useState<string[]>([]);
  const [editAddonDropdownOpen, setEditAddonDropdownOpen] = useState<boolean[]>([]);
  const [isCreatingAddon, setIsCreatingAddon] = useState(false);

  // Vendor tab state
  const [vendors, setVendors] = useState<{category: string; supplier: string; supplierName: string; amount: number; notes: string}[]>([]);
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ category: "", supplier: "", amount: "", notes: "" });
  const [vendorSupplierOpen, setVendorSupplierOpen] = useState(false);
  const [vendorSupplierSearch, setVendorSupplierSearch] = useState("");
  const [isSavingVendors, setIsSavingVendors] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [isCreatingVendorSupplier, setIsCreatingVendorSupplier] = useState(false);

  // Expense tab state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [addingExpense, setAddingExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().slice(0, 10), description: "", amount: "", category: "", staff: "" });
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [expCatOpen, setExpCatOpen] = useState(false);
  const [expCatSearch, setExpCatSearch] = useState("");
  const [creatingExpCat, setCreatingExpCat] = useState(false);
  const [expenseFile, setExpenseFile] = useState<File | null>(null);
  const expenseFileRef = useRef<HTMLInputElement>(null);

  const invalidate = useInvalidate();
  const { mutateAsync: updateRecord } = useUpdate();
  const { list } = useNavigation();
  const { data: roles } = usePermissions<string[]>({});
  const isFinance = hasModuleAccess(roles ?? [], FINANCE_ROLES);
  const isWeddingManager = hasModuleAccess(roles ?? [], WEDDING_MANAGER_ROLES);
  const { employeeId: myEmployeeId } = useMyEmployee();

  // Fetch Project
  const { result: project } = useOne({
    resource: "Project",
    id: name!,
    meta: {
      fields: [
        "name",
        "project_name",
        "status",
        "custom_project_stage",
        "customer",
        "expected_start_date",
        "expected_end_date",
        "sales_order",
        "custom_lead_planner",
        "custom_support_planner",
        "custom_assistant_1",
        "custom_assistant_2",
        "custom_assistant_3",
        "custom_assistant_4",
        "custom_assistant_5",
        "custom_lead_commission_pct",
        "custom_support_commission_pct",
        "custom_assistant_commission_pct",
        "custom_sales_person",
        "custom_booking_date",
        "custom_service_type",
        "custom_wedding_type",
        "custom_wedding_vendors",
        "custom_total_budget",
      ],
    },
  });

  // Fetch linked Sales Order for wedding details
  const { result: salesOrderResult } = useOne({
    resource: "Sales Order",
    id: project?.sales_order!,
    meta: {
      fields: [
        "name",
        "customer_name",
        "grand_total",
        "custom_venue",
        "custom_commission_base",
        "delivery_date",
        "per_billed",
        "per_delivered",
        "status",
        "total_taxes_and_charges",
      ],
    },
    queryOptions: { enabled: !!project?.sales_order },
  });
  const salesOrder = salesOrderResult;

  // Fetch Customer info
  const { result: customerResult } = useOne({
    resource: "Customer",
    id: project?.customer!,
    meta: {
      fields: ["name", "customer_name", "mobile_no", "email_id"],
    },
    queryOptions: { enabled: !!project?.customer },
  });
  const customer = customerResult;

  // Fetch Sales Order items via the parent SO doc (Sales Order Item direct list returns 403)
  const [soItems, setSOItems] = useState<{ name: string; item_code: string; item_name: string; qty: number; rate: number; amount: number }[]>([]);

  const fetchSOItems = useCallback(async (soName: string) => {
    try {
      const res = await fetch(
        `/api/resource/Sales Order/${encodeURIComponent(soName)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      setSOItems(data.data?.items ?? []);
    } catch {
      setSOItems([]);
    }
  }, []);

  useEffect(() => {
    if (project?.sales_order) fetchSOItems(project.sales_order);
  }, [project?.sales_order, fetchSOItems]);

  const addOnItems = useMemo(
    () => soItems.filter((i) => i.item_code !== "Wedding Planning Service"),
    [soItems]
  );

  // Fetch Sales Invoices linked to this Project via the `project` field
  // (sales_order is not a writable/filterable doc-level field on Sales Invoice)
  const [invoices, setInvoices] = useState<any[]>([]);

  const fetchInvoices = useCallback(async (projectName: string) => {
    try {
      const fields = JSON.stringify(["name", "grand_total", "outstanding_amount", "status", "due_date", "posting_date"]);
      const filters = JSON.stringify([["project", "=", projectName]]);
      const res = await fetch(
        `/api/resource/Sales Invoice?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit=100`,
        { credentials: "include" }
      );
      const data = await res.json();
      setInvoices(data.data ?? []);
    } catch {
      setInvoices([]);
    }
  }, []);

  useEffect(() => {
    if (name) fetchInvoices(name);
  }, [name, fetchInvoices]);

  // Fetch Tasks linked to this Project
  const { result: tasksResult } = useList({
    resource: "Task",
    pagination: { mode: "off" as const },
    filters: [{ field: "project", operator: "eq", value: name! }],
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name",
        "subject",
        "status",
        "priority",
        "exp_end_date",
        "custom_wedding_phase",
        "_assign",
        "custom_shared_with",
        "owner",
      ],
    },
    queryOptions: { enabled: !!name },
  });
  const tasks = tasksResult?.data ?? [];

  // Fetch Employees for task assignment and team display
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" as const },
    meta: { fields: ["name", "employee_name", "first_name", "last_name", "user_id", "status"] },
  });
  const employees = useMemo(
    () => (employeesResult?.data ?? []).map((e: any) => ({
      id: e.name,
      name: displayName(e),
      userId: e.user_id,
    })),
    [employeesResult?.data]
  );

  // Fetch Venues (Suppliers in Wedding Venues group)
  const { result: venuesResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" as const },
    filters: [{ field: "supplier_group", operator: "eq", value: "Wedding Venues" }],
    meta: { fields: ["name", "supplier_name"] },
  });
  const venues = (venuesResult?.data ?? []) as { name: string; supplier_name: string }[];

  // Fetch all Suppliers for vendor selection
  const { result: allSuppliersResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" as const },
    meta: { fields: ["name", "supplier_name"] },
  });
  const allSuppliers = useMemo(
    () => (allSuppliersResult?.data ?? []) as { name: string; supplier_name: string }[],
    [allSuppliersResult?.data]
  );

  // Fetch available add-on items via backend (avoids ERPNext 403)
  const [availableAddOns, setAvailableAddOns] = useState<{ name: string; item_name: string; custom_include_in_commission?: number }[]>([]);
  const fetchAddonItems = useCallback(async () => {
    try {
      const res = await fetch("/inquiry-api/wedding/addon-items", { credentials: "include" });
      const json = await res.json();
      const items = json.data ?? [];
      setAvailableAddOns(items);
      return items;
    } catch { setAvailableAddOns([]); return []; }
  }, []);
  useEffect(() => { fetchAddonItems(); }, [fetchAddonItems]);

  // Sync vendors from project data
  useEffect(() => {
    if (project?.custom_wedding_vendors) {
      setVendors(project.custom_wedding_vendors.map((v: any) => ({
        category: v.category,
        supplier: v.supplier,
        supplierName: allSuppliers.find(s => s.name === v.supplier)?.supplier_name || v.supplier,
        amount: v.amount || 0,
        notes: v.notes || "",
      })));
    }
  }, [project?.custom_wedding_vendors, allSuppliers]);

  async function saveVendors(updatedVendors: typeof vendors) {
    setIsSavingVendors(true);
    setVendorError(null);
    try {
      const resp = await fetch(`/inquiry-api/wedding/${name}/vendors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendors: updatedVendors.map(v => ({
            category: v.category,
            supplier: v.supplier,
            amount: v.amount,
            notes: v.notes,
          })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to save vendors");
      }
      invalidate({ resource: "Project", invalidates: ["detail"], id: name });
    } catch (error) {
      setVendorError(error instanceof Error ? error.message : "Failed to save vendors");
    } finally {
      setIsSavingVendors(false);
    }
  }

  function handleAddVendor() {
    if (!newVendor.category || !newVendor.supplier) return;
    const supplierObj = allSuppliers.find(s => s.name === newVendor.supplier);
    const updated = [...vendors, {
      category: newVendor.category,
      supplier: newVendor.supplier,
      supplierName: supplierObj?.supplier_name || newVendor.supplier,
      amount: parseFloat(newVendor.amount) || 0,
      notes: newVendor.notes,
    }];
    setVendors(updated);
    saveVendors(updated);
    setNewVendor({ category: "", supplier: "", amount: "", notes: "" });
    setAddingVendor(false);
    setVendorSupplierSearch("");
  }

  function handleDeleteVendor(index: number) {
    const updated = vendors.filter((_, i) => i !== index);
    setVendors(updated);
    saveVendors(updated);
  }

  async function handleCreateVendorSupplier() {
    if (!vendorSupplierSearch.trim()) return;
    setIsCreatingVendorSupplier(true);
    try {
      const resp = await fetch("/inquiry-api/wedding/vendors/create-supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_name: vendorSupplierSearch.trim() }),
      });
      if (!resp.ok) throw new Error("Failed to create supplier");
      const created = await resp.json();
      // Refresh suppliers list
      invalidate({ resource: "Supplier", invalidates: ["list"] });
      setNewVendor({ ...newVendor, supplier: created.name });
      setVendorSupplierOpen(false);
    } catch (error) {
      setVendorError(error instanceof Error ? error.message : "Failed to create supplier");
    } finally {
      setIsCreatingVendorSupplier(false);
    }
  }

  // Expense tab logic
  const isOnTeam = useMemo(() => {
    if (!myEmployeeId || !project) return false;
    return [
      project.custom_lead_planner,
      project.custom_support_planner,
      project.custom_assistant_1,
      project.custom_assistant_2,
      project.custom_assistant_3,
      project.custom_assistant_4,
      project.custom_assistant_5,
    ].includes(myEmployeeId);
  }, [myEmployeeId, project]);

  const showExpensesTab = isFinance || isOnTeam;

  const fetchExpenses = useCallback(async (projectName: string) => {
    try {
      const res = await fetch(`/inquiry-api/expenses?project=${encodeURIComponent(projectName)}`, { credentials: "include" });
      if (res.ok) setExpenses(await res.json());
    } catch { setExpenses([]); }
  }, []);

  useEffect(() => {
    if (name && showExpensesTab) fetchExpenses(name);
  }, [name, showExpensesTab, fetchExpenses]);

  const approvedExpensesTotal = useMemo(
    () => expenses.filter(e => e.status === "Approved").reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses]
  );

  // Team members for expense staff dropdown (must be before early return to respect Rules of Hooks)
  const weddingTeam = useMemo(() => {
    if (!project) return [];
    const ids = [
      project.custom_lead_planner,
      project.custom_support_planner,
      project.custom_assistant_1,
      project.custom_assistant_2,
      project.custom_assistant_3,
      project.custom_assistant_4,
      project.custom_assistant_5,
    ].filter(Boolean) as string[];
    return employees.filter(e => ids.includes(e.id));
  }, [project, employees]);

  // Fetch expense categories
  useEffect(() => {
    fetch("/inquiry-api/expense/categories")
      .then(r => r.json())
      .then(data => setExpenseCategories(data))
      .catch(() => {});
  }, []);

  async function handleCreateExpCat() {
    if (!expCatSearch.trim()) return;
    setCreatingExpCat(true);
    try {
      const resp = await fetch("/inquiry-api/expense/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: expCatSearch.trim() }),
      });
      if (!resp.ok) throw new Error("Failed to create category");
      const newCat = await resp.json();
      setExpenseCategories(prev => [...prev, newCat]);
      setNewExpense(prev => ({ ...prev, category: newCat.name }));
      setExpCatOpen(false);
    } catch {
      setExpenseError("Failed to create category");
    } finally {
      setCreatingExpCat(false);
    }
  }

  async function handleAddExpense() {
    if (!newExpense.description || !newExpense.amount || !newExpense.category) return;
    setIsSavingExpense(true);
    setExpenseError(null);
    try {
      const resp = await fetch("/inquiry-api/expense/wedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          project: name,
          date: newExpense.date,
          description: newExpense.description,
          amount: parseFloat(newExpense.amount),
          category: newExpense.category,
          ...(newExpense.staff ? { staff: newExpense.staff } : {}),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create expense");
      }
      const result = await resp.json();
      // Upload receipt image if provided
      if (expenseFile && result.name) {
        try {
          await uploadFile(expenseFile, "Purchase Invoice", result.name);
        } catch (err) {
          console.error("Receipt upload failed:", err);
        }
      }
      setAddingExpense(false);
      setNewExpense({ date: new Date().toISOString().slice(0, 10), description: "", amount: "", category: "", staff: "" });
      setExpenseFile(null);
      if (expenseFileRef.current) expenseFileRef.current.value = "";
      fetchExpenses(name!);
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to create expense");
    } finally {
      setIsSavingExpense(false);
    }
  }

  async function handleApproveExpense(piName: string) {
    try {
      const resp = await fetch(`/inquiry-api/expense/${piName}/approve`, { method: "POST", credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to approve");
      }
      fetchExpenses(name!);
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to approve expense");
    }
  }

  async function handleRejectExpense(piName: string) {
    try {
      const resp = await fetch(`/inquiry-api/expense/${piName}/reject`, { method: "POST", credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to reject");
      }
      fetchExpenses(name!);
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to reject expense");
    }
  }

  async function handleDeleteExpense(piName: string) {
    try {
      const resp = await fetch(`/inquiry-api/expense/${piName}`, { method: "DELETE", credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to delete");
      }
      fetchExpenses(name!);
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to delete expense");
    }
  }

  function getEmployeeNameById(id: string | null | undefined): string | null {
    if (!id) return null;
    const emp = employees.find((e) => e.id === id);
    return emp?.name || id;
  }

  // Populate details form (venue + add-ons)
  function populateDetailsForm(freshAddOns?: typeof availableAddOns) {
    if (!project) return;
    const addOnsLookup = freshAddOns ?? availableAddOns;
    const currentAddOns = addOnItems.map((i) => {
      const itemMeta = addOnsLookup.find((a) => a.name === i.item_code);
      return {
        itemCode: i.item_code,
        itemName: i.item_name,
        qty: i.qty,
        rate: i.rate,
        includeInCommission: !!(itemMeta?.custom_include_in_commission),
      };
    });
    const planningItem = soItems.find((i) => i.item_code === "Wedding Planning Service");
    setEditForm((prev) => ({
      ...prev,
      weddingDate: project?.expected_end_date || "",
      venue: salesOrder?.custom_venue || "",
      packageAmount: planningItem ? String(planningItem.rate) : "",
      totalBudget: project?.custom_total_budget ? String(project.custom_total_budget) : "",
      addOns: currentAddOns,
      taxType: (salesOrder?.total_taxes_and_charges > 0) ? "vat_included" : "tax_free",
      serviceType: project?.custom_service_type || "",
    }));
    setEditAddonSearch(currentAddOns.map((a) => a.itemName));
    setEditAddonDropdownOpen(currentAddOns.map(() => false));
    const v = venues.find((v) => v.name === salesOrder?.custom_venue);
    setEditVenueDisplayName(v?.supplier_name || salesOrder?.custom_venue || "");
  }

  async function handleCreateEditAddon(rowIndex: number, addonName: string, includeInCommission: boolean) {
    if (!addonName.trim()) return;
    setIsCreatingAddon(true);
    try {
      const resp = await fetch("/inquiry-api/wedding/addon-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item_name: addonName.trim() }),
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
      const itemCode = item.name ?? addonName;
      const itemName = item.item_name ?? addonName;
      const updated = editForm.addOns.map((a, i) =>
        i === rowIndex ? { ...a, itemCode, itemName, includeInCommission } : a
      );
      setEditForm({ ...editForm, addOns: updated });
      const newSearch = [...editAddonSearch];
      newSearch[rowIndex] = itemName;
      setEditAddonSearch(newSearch);
      const newOpen = [...editAddonDropdownOpen];
      newOpen[rowIndex] = false;
      setEditAddonDropdownOpen(newOpen);
      // Refresh addon list so the new item appears in future dropdowns
      fetchAddonItems();
    } catch (err: any) {
      setEditError(err?.message || "Failed to create add-on");
    } finally {
      setIsCreatingAddon(false);
    }
  }

  // Populate staff form (lead/support/assistants)
  function populateStaffForm() {
    if (!project) return;
    setEditForm((prev) => ({
      ...prev,
      leadPlanner: project.custom_lead_planner || "",
      supportPlanner: project.custom_support_planner || "",
      assistant1: project.custom_assistant_1 || "",
      assistant2: project.custom_assistant_2 || "",
      assistant3: project.custom_assistant_3 || "",
      assistant4: project.custom_assistant_4 || "",
      assistant5: project.custom_assistant_5 || "",
      leadCommissionPct: project.custom_lead_commission_pct ? String(project.custom_lead_commission_pct) : "",
      supportCommissionPct: project.custom_support_commission_pct ? String(project.custom_support_commission_pct) : "",
      assistantCommissionPct: project.custom_assistant_commission_pct ? String(project.custom_assistant_commission_pct) : "",
    }));
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      const resp = await fetch(`/inquiry-api/wedding/${name}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          venue: editForm.venue || null,
          wedding_date: editForm.weddingDate || null,
          package_amount: editForm.packageAmount ? parseFloat(editForm.packageAmount) : null,
          tax_type: editForm.taxType === "vat_included" ? "vat" : "none",
          service_type: editForm.serviceType,
          addons: editForm.addOns.map((a) => ({
            item_code: a.itemCode,
            item_name: a.itemName,
            qty: a.qty,
            rate: a.rate,
            include_in_commission: a.includeInCommission,
          })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const detail = err.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : detail || "Failed to save details";
        throw new Error(msg);
      }
      // Save total budget on Project if changed
      const budgetVal = editForm.totalBudget ? parseFloat(editForm.totalBudget) : 0;
      if (budgetVal !== (project?.custom_total_budget || 0)) {
        await updateRecord({
          resource: "Project",
          id: name!,
          values: { custom_total_budget: budgetVal },
        });
      }
      invalidate({ resource: "Project", invalidates: ["detail"], id: name! });
      invalidate({ resource: "Sales Order", invalidates: ["detail"], id: project?.sales_order! });
      const updatedProject = await fetch(`/api/resource/Project/${name}`, { credentials: "include" }).then(r => r.json());
      const newSOName = updatedProject?.data?.sales_order;
      if (newSOName) fetchSOItems(newSOName);
      setEditDetailsOpen(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save changes");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleSaveStaff(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateRecord({
        resource: "Project",
        id: name!,
        values: {
          custom_lead_planner: editForm.leadPlanner || null,
          custom_support_planner: editForm.supportPlanner || null,
          custom_assistant_1: editForm.assistant1 || null,
          custom_assistant_2: editForm.assistant2 || null,
          custom_assistant_3: editForm.assistant3 || null,
          custom_assistant_4: editForm.assistant4 || null,
          custom_assistant_5: editForm.assistant5 || null,
          custom_lead_commission_pct: editForm.leadCommissionPct ? parseFloat(editForm.leadCommissionPct) : null,
          custom_support_commission_pct: editForm.supportCommissionPct ? parseFloat(editForm.supportCommissionPct) : null,
          custom_assistant_commission_pct: editForm.assistantCommissionPct ? parseFloat(editForm.assistantCommissionPct) : null,
        },
      });
      invalidate({ resource: "Project", invalidates: ["detail"], id: name! });
      setEditStaffOpen(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save changes");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleSaveSales(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateRecord({
        resource: "Project",
        id: name!,
        values: {
          custom_sales_person: salesForm.salesPerson || null,
          custom_booking_date: salesForm.bookingDate || null,
        },
      });
      invalidate({ resource: "Project", invalidates: ["detail"], id: name! });
      setEditSalesOpen(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save changes");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/inquiry-api/wedding/${name}/delete`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Delete failed");
      }
      list("Project");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleStageChange(newStage: string) {
    await updateRecord({
      resource: "Project",
      id: name!,
      values: { custom_project_stage: newStage },
    });
    invalidate({ resource: "Project", invalidates: ["detail"], id: name! });
  }

  function toggleSharedWith(employeeId: string) {
    setSharedWith((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }

  function resetTaskForm() {
    setTaskForm({
      subject: "",
      phase: "",
      deadline: "",
      priority: "Medium",
      assignee: "",
    });
    setSharedWith(new Set());
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.subject.trim() || !taskForm.phase || !taskForm.deadline) return;

    setIsSubmittingTask(true);
    try {
      const assigneeEmployee = employees.find((e) => e.id === taskForm.assignee);
      const assigneeUserId = assigneeEmployee?.userId;

      const resp = await fetch("/inquiry-api/task/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: name,
          subject: taskForm.subject.trim(),
          phase: taskForm.phase,
          deadline: taskForm.deadline,
          priority: taskForm.priority || "Medium",
          shared_with: Array.from(sharedWith).join(","),
          assignee_user_id: assigneeUserId || null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create task");
      }

      setCreateTaskOpen(false);
      resetTaskForm();
      invalidate({ resource: "Task", invalidates: ["list"] });
    } finally {
      setIsSubmittingTask(false);
    }
  }

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!milestoneForm.amount) return;
    setIsSubmittingMilestone(true);
    setMilestoneError(null);
    try {
      const url = editingMilestone
        ? `/inquiry-api/wedding/${name}/milestone/${editingMilestone}`
        : `/inquiry-api/wedding/${name}/milestone`;
      const method = editingMilestone ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(milestoneForm.amount),
          label: milestoneForm.label,
          invoice_date: milestoneForm.invoiceDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to ${editingMilestone ? "update" : "create"} milestone`);
      }
      setAddMilestoneOpen(false);
      setEditingMilestone(null);
      setMilestoneForm({ label: "", amount: "", invoiceDate: new Date().toISOString().slice(0, 10) });
      if (name) fetchInvoices(name);
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : `Failed to ${editingMilestone ? "update" : "create"} milestone`);
    } finally {
      setIsSubmittingMilestone(false);
    }
  }

  async function handleEditMilestoneClick(inv: any) {
    // Fetch full SI doc to get item_name for label parsing
    try {
      const res = await fetch(`/api/resource/Sales Invoice/${inv.name}`, { credentials: "include" });
      const data = await res.json();
      const itemName = data.data?.items?.[0]?.item_name || "";
      const separator = " \u2014 ";
      const label = itemName.includes(separator) ? itemName.split(separator)[0] : "";
      setEditingMilestone(inv.name);
      setMilestoneForm({
        label,
        amount: String(inv.grand_total),
        invoiceDate: inv.posting_date || new Date().toISOString().slice(0, 10),
      });
      setMilestoneError(null);
      setAddMilestoneOpen(true);
    } catch {
      // Fallback: open with no label
      setEditingMilestone(inv.name);
      setMilestoneForm({
        label: "",
        amount: String(inv.grand_total),
        invoiceDate: inv.posting_date || new Date().toISOString().slice(0, 10),
      });
      setMilestoneError(null);
      setAddMilestoneOpen(true);
    }
  }

  async function handleDeleteMilestone() {
    if (!editingMilestone || !window.confirm("Delete this payment milestone? This cannot be undone.")) return;
    setIsSubmittingMilestone(true);
    setMilestoneError(null);
    try {
      const res = await fetch(`/inquiry-api/wedding/${name}/milestone/${editingMilestone}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to delete milestone");
      }
      setAddMilestoneOpen(false);
      setEditingMilestone(null);
      if (name) fetchInvoices(name);
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : "Failed to delete milestone");
    } finally {
      setIsSubmittingMilestone(false);
    }
  }

  function getAssigneeFromTask(task: any) {
    try {
      const assignedUsers = JSON.parse(task._assign || "[]");
      if (assignedUsers.length === 0) return null;
      const userId = assignedUsers[0];
      const employee = employees.find((e) => e.userId === userId);
      return employee?.name || userId;
    } catch {
      return null;
    }
  }

  function getSharedWithFromTask(task: any) {
    if (!task.custom_shared_with) return [];
    const ids = task.custom_shared_with.split(",").filter(Boolean);
    return ids
      .map((id: string) => {
        const employee = employees.find((e) => e.id === id.trim());
        return employee?.name || id;
      })
      .filter(Boolean);
  }

  if (!project) {
    return <DetailSkeleton />;
  }

  const weddingDate = project.expected_end_date || salesOrder?.delivery_date;
  const venueName = salesOrder?.custom_venue;
  const totalValue = salesOrder?.grand_total || 0;
  const customerName = customer?.customer_name || salesOrder?.customer_name || project.project_name;

  // Payment calculations
  const totalInvoiced = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.grand_total || 0),
    0
  );
  const totalOutstanding = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.outstanding_amount || 0),
    0
  );
  const totalPaid = totalInvoiced - totalOutstanding;
  const paidPct = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;

  // Team members
  const assistants = [
    project.custom_assistant_1,
    project.custom_assistant_2,
    project.custom_assistant_3,
    project.custom_assistant_4,
    project.custom_assistant_5,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {customerName}
            </h1>
          </div>
          <Badge variant={statusVariant(project.status)} className="shrink-0">
            {project.status}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
          {weddingDate && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(weddingDate)}
            </span>
          )}
          {venueName && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {venueName}
            </span>
          )}
        </div>

      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {customerName}
          </h1>
          <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
          <Badge variant={stageBadgeVariant(project.custom_project_stage || "Planning")}>
            {project.custom_project_stage || "Planning"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        </div>
      </div>

      {/* Main Content - 3 Tabs */}
      <div className="min-w-0">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="overview" className="flex-1 lg:flex-none">
                Overview
              </TabsTrigger>
              <TabsTrigger value="vendors" className="flex-1 lg:flex-none">
                Vendors
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex-1 lg:flex-none">
                Tasks
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 lg:flex-none">
                Activity
              </TabsTrigger>
              {showExpensesTab && (
                <TabsTrigger value="expenses" className="flex-1 lg:flex-none">
                  Expenses
                </TabsTrigger>
              )}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Wedding Details */}
              {(weddingDate || venueName || totalValue > 0 || addOnItems.length > 0) && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle>Wedding Details</CardTitle>
                    {isWeddingManager && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => { const fresh = await fetchAddonItems(); populateDetailsForm(fresh); setEditDetailsOpen(true); }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {weddingDate && (
                      <div className="flex items-start gap-3 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Date</p>
                          <p className="font-medium">{formatDate(weddingDate)}</p>
                        </div>
                      </div>
                    )}
                    {venueName && (
                      <div className="flex items-start gap-3 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Venue</p>
                          <p className="font-medium">{venueName}</p>
                        </div>
                      </div>
                    )}
                    {(project.custom_service_type || project.custom_wedding_type) && (
                      <div className="flex items-start gap-3 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Package</p>
                          <div className="flex gap-2 mt-0.5">
                            {project.custom_service_type && (
                              <Badge variant={project.custom_service_type.toLowerCase().includes("full") ? "default" : "secondary"}>
                                {project.custom_service_type}
                              </Badge>
                            )}
                            {project.custom_wedding_type && (
                              <Badge variant="outline">{project.custom_wedding_type}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {isFinance && totalValue > 0 && (
                      <div className="flex items-start gap-3 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Total Package</p>
                          <p className="font-medium">{formatVND(totalValue)}</p>
                        </div>
                      </div>
                    )}
                    {isFinance && totalValue > 0 && (
                      <div className="flex items-start gap-3 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Commission Base</p>
                          <p className="font-medium">{formatVND(salesOrder?.custom_commission_base || salesOrder?.grand_total || 0)}</p>
                        </div>
                      </div>
                    )}
                    {project?.custom_total_budget > 0 && (
                      <div className="flex items-start gap-3 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Total Wedding Budget</p>
                          <p className="font-medium">{formatVND(project.custom_total_budget)}</p>
                        </div>
                      </div>
                    )}
                    {addOnItems.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Add-ons</p>
                        <div className="space-y-1">
                          {addOnItems.map((item) => (
                            <div key={item.name} className="flex justify-between text-sm">
                              <span>{item.item_name}</span>
                              {isFinance && <span className="text-muted-foreground">{formatVND(item.amount)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Payment Milestones */}
              {isFinance && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Milestones</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Progress Header */}
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between items-baseline">
                      <span className="text-2xl font-semibold" style={{ fontFamily: "Georgia, serif" }}>
                        {paidPct}%{" "}
                        <span className="text-sm font-normal text-muted-foreground">paid</span>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatVND(totalPaid)} of {formatVND(totalValue)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(paidPct, 100)}%`, backgroundColor: "#C4A962" }}
                      />
                    </div>
                    {totalOutstanding > 0 && (
                      <p className="text-xs text-muted-foreground">{formatVND(totalOutstanding)} remaining</p>
                    )}
                  </div>

                  {/* Milestone timeline */}
                  {invoices.length > 0 ? (
                    <div className="relative">
                      {(invoices as any[]).map((inv, index) => {
                        const isPaid = inv.status === "Paid" || inv.outstanding_amount === 0;
                        const isOverdue = inv.status === "Overdue";
                        const pct = totalValue > 0 ? Math.round((inv.grand_total / totalValue) * 100) : 0;
                        const isLast = index === invoices.length - 1;
                        return (
                          <div
                            key={inv.name}
                            className={cn("flex gap-3", isFinance && "cursor-pointer hover:bg-accent/50 rounded-md -mx-1 px-1")}
                            onClick={isFinance ? () => handleEditMilestoneClick(inv) : undefined}
                          >
                            {/* Timeline dot + connector */}
                            <div className="flex flex-col items-center">
                              <div
                                className={cn(
                                  "w-3 h-3 rounded-full mt-0.5 shrink-0 border-2",
                                  isPaid
                                    ? "border-[#C4A962]"
                                    : isOverdue
                                    ? "bg-destructive border-destructive"
                                    : "bg-background border-muted-foreground/40"
                                )}
                                style={isPaid ? { backgroundColor: "#C4A962" } : undefined}
                              />
                              {!isLast && <div className="w-px flex-1 bg-border min-h-[24px]" />}
                            </div>
                            {/* Content */}
                            <div className="flex items-start justify-between pb-4 flex-1 min-w-0">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{inv.name}</p>
                                {inv.due_date && (
                                  <p className="text-xs text-muted-foreground">{formatDate(inv.due_date)}</p>
                                )}
                              </div>
                              <div className="flex items-start gap-2 shrink-0 ml-3">
                                <div className="text-right">
                                  <p className="text-sm font-medium">{formatVND(inv.grand_total)}</p>
                                  <p className="text-xs text-muted-foreground">{pct}%</p>
                                  <Badge
                                    variant={isPaid ? "success" : isOverdue ? "destructive" : "secondary"}
                                    className="text-[10px] mt-0.5"
                                  >
                                    {isPaid ? "Paid" : isOverdue ? "Overdue" : "Unpaid"}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No payment milestones yet.
                    </p>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => {
                      setEditingMilestone(null);
                      setMilestoneForm({
                        label: "",
                        amount: "",
                        invoiceDate: new Date().toISOString().slice(0, 10),
                      });
                      setMilestoneError(null);
                      setAddMilestoneOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Payment Milestone
                  </Button>
                </CardContent>
              </Card>
              )}

              {/* Team */}
              {(project.custom_lead_planner || project.custom_support_planner || assistants.length > 0) && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle>Team</CardTitle>
                    {isWeddingManager && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { populateStaffForm(); setEditStaffOpen(true); }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {project.custom_lead_planner && (
                      <ReadOnlyField
                        label="Lead Planner"
                        value={
                          (getEmployeeNameById(project.custom_lead_planner) || project.custom_lead_planner) +
                          (isFinance && project.custom_lead_commission_pct ? ` (${project.custom_lead_commission_pct}%)` : "")
                        }
                      />
                    )}
                    {project.custom_support_planner && (
                      <ReadOnlyField
                        label="Support Planner"
                        value={
                          (getEmployeeNameById(project.custom_support_planner) || project.custom_support_planner) +
                          (isFinance && project.custom_support_commission_pct ? ` (${project.custom_support_commission_pct}%)` : "")
                        }
                      />
                    )}
                    {assistants.map((asst: any, i) => (
                      <ReadOnlyField
                        key={i}
                        label={`Assistant ${i + 1}`}
                        value={
                          (getEmployeeNameById(asst) || asst) +
                          (isFinance && i === 0 && project.custom_assistant_commission_pct ? ` (${project.custom_assistant_commission_pct}%)` : "")
                        }
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Sales Information */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>Sales Information</CardTitle>
                  {isWeddingManager && (
                    <Button size="sm" variant="outline" onClick={() => {
                      setSalesForm({
                        salesPerson: project.custom_sales_person || "",
                        bookingDate: project.custom_booking_date || "",
                      });
                      setEditError(null);
                      setEditSalesOpen(true);
                    }}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <ReadOnlyField label="Sold by" value={getEmployeeNameById(project.custom_sales_person) || project.custom_sales_person || "—"} />
                  <ReadOnlyField label="Booking Date" value={project.custom_booking_date ? formatDate(project.custom_booking_date) : "—"} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Vendors Tab */}
            <TabsContent value="vendors" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>Wedding Vendors</CardTitle>
                  <Button size="sm" onClick={() => setAddingVendor(true)} disabled={addingVendor}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Vendor
                  </Button>
                </CardHeader>
                <CardContent>
                  {vendorError && (
                    <div className="flex items-center gap-2 p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {vendorError}
                    </div>
                  )}
                  <div className="border rounded-md">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium">Category</th>
                          <th className="px-3 py-2 text-left font-medium">Vendor</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="px-3 py-2 text-left font-medium">Notes</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendors.map((v, i) => (
                          <tr key={i} className="border-b last:border-b-0">
                            <td className="px-3 py-2">{v.category}</td>
                            <td className="px-3 py-2">{v.supplierName}</td>
                            <td className="px-3 py-2 text-right">{v.amount ? formatVND(v.amount) : "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{v.notes}</td>
                            <td className="px-3 py-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => handleDeleteVendor(i)} disabled={isSavingVendors}>
                                <X className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {addingVendor && (
                          <tr className="border-b last:border-b-0 bg-muted/30">
                            <td className="px-3 py-2">
                              <Select value={newVendor.category}
                                onValueChange={(v) => setNewVendor({ ...newVendor, category: v })}>
                                <SelectTrigger className="h-8"><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent>
                                  {VENDOR_CATEGORIES.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <ShadcnPopover open={vendorSupplierOpen} onOpenChange={setVendorSupplierOpen}>
                                <ShadcnPopoverTrigger asChild>
                                  <button type="button"
                                    className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm h-8">
                                    <span className={newVendor.supplier ? "" : "text-muted-foreground"}>
                                      {newVendor.supplier
                                        ? (allSuppliers.find(s => s.name === newVendor.supplier)?.supplier_name ?? newVendor.supplier)
                                        : "Select vendor..."}
                                    </span>
                                    <ChevronsUpDown className="h-3 w-3 opacity-50" />
                                  </button>
                                </ShadcnPopoverTrigger>
                                <ShadcnPopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                  <Command>
                                    <CommandInput placeholder="Search vendors..." value={vendorSupplierSearch} onValueChange={setVendorSupplierSearch} />
                                    <CommandList>
                                      <CommandEmpty>
                                        <div className="py-2 text-center">
                                          <p className="text-sm text-muted-foreground mb-2">No vendors found</p>
                                          {vendorSupplierSearch.trim() && (
                                            <Button type="button" variant="outline" size="sm"
                                              onClick={handleCreateVendorSupplier} disabled={isCreatingVendorSupplier}>
                                              <Plus className="h-3 w-3 mr-1" />
                                              {isCreatingVendorSupplier ? "Creating..." : `Create "${vendorSupplierSearch.trim()}"`}
                                            </Button>
                                          )}
                                        </div>
                                      </CommandEmpty>
                                      <CommandGroup>
                                        {allSuppliers
                                          .filter(s => !vendorSupplierSearch || s.supplier_name.toLowerCase().includes(vendorSupplierSearch.toLowerCase()))
                                          .map(s => (
                                            <CommandItem key={s.name} value={s.supplier_name}
                                              onSelect={() => {
                                                setNewVendor({ ...newVendor, supplier: s.name });
                                                setVendorSupplierOpen(false);
                                              }}>
                                              <Check className={cn("mr-2 h-4 w-4", newVendor.supplier === s.name ? "opacity-100" : "opacity-0")} />
                                              {s.supplier_name}
                                            </CommandItem>
                                          ))}
                                      </CommandGroup>
                                      {vendorSupplierSearch.trim() && allSuppliers.some(s => s.supplier_name.toLowerCase().includes(vendorSupplierSearch.toLowerCase())) && (
                                        <CommandGroup heading="Create new">
                                          <CommandItem value={`__create_${vendorSupplierSearch}`} onSelect={handleCreateVendorSupplier}>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Create "{vendorSupplierSearch.trim()}"
                                          </CommandItem>
                                        </CommandGroup>
                                      )}
                                    </CommandList>
                                  </Command>
                                </ShadcnPopoverContent>
                              </ShadcnPopover>
                            </td>
                            <td className="px-3 py-2">
                              <Input className="h-8 w-28 text-right" type="number" min="0" step="1" placeholder="Amount"
                                value={newVendor.amount}
                                onChange={e => setNewVendor({ ...newVendor, amount: e.target.value })} />
                            </td>
                            <td className="px-3 py-2">
                              <Input className="h-8" placeholder="Notes (optional)"
                                value={newVendor.notes}
                                onChange={e => setNewVendor({ ...newVendor, notes: e.target.value })} />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={handleAddVendor} disabled={!newVendor.category || !newVendor.supplier || isSavingVendors}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => { setAddingVendor(false); setNewVendor({ category: "", supplier: "", amount: "", notes: "" }); setVendorSupplierSearch(""); }}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {vendors.length === 0 && !addingVendor && (
                          <tr>
                            <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                              No vendors added yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Project Tasks
                  </CardTitle>
                  <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Task
                  </Button>
                  <Sheet open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
                    <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
                      <SheetHeader className="px-6 py-4 border-b shrink-0">
                        <SheetTitle>Create Task</SheetTitle>
                      </SheetHeader>
                      <form onSubmit={handleCreateTask} className="flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="task-subject">Subject *</Label>
                            <Input
                              id="task-subject"
                              placeholder="e.g. Send vendor contracts"
                              value={taskForm.subject}
                              onChange={(e) =>
                                setTaskForm({ ...taskForm, subject: e.target.value })
                              }
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="task-phase">Phase *</Label>
                              <Select
                                value={taskForm.phase}
                                onValueChange={(value) =>
                                  setTaskForm({ ...taskForm, phase: value })
                                }
                                required
                              >
                                <SelectTrigger id="task-phase">
                                  <SelectValue placeholder="Select phase" />
                                </SelectTrigger>
                                <SelectContent>
                                  {WEDDING_PHASES.map((phase) => (
                                    <SelectItem key={phase} value={phase}>
                                      {phase}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="task-deadline">Deadline *</Label>
                              <Input
                                id="task-deadline"
                                type="date"
                                value={taskForm.deadline}
                                onChange={(e) =>
                                  setTaskForm({ ...taskForm, deadline: e.target.value })
                                }
                                required
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="task-assignee">Assign To</Label>
                              <Select
                                value={taskForm.assignee}
                                onValueChange={(value) =>
                                  setTaskForm({ ...taskForm, assignee: value })
                                }
                              >
                                <SelectTrigger id="task-assignee">
                                  <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                  {employees.map((emp) => (
                                    <SelectItem key={emp.id} value={emp.id}>
                                      {emp.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="task-priority">Priority</Label>
                              <Select
                                value={taskForm.priority}
                                onValueChange={(value) =>
                                  setTaskForm({ ...taskForm, priority: value })
                                }
                              >
                                <SelectTrigger id="task-priority">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PRIORITY_OPTIONS.map((priority) => (
                                    <SelectItem key={priority} value={priority}>
                                      {priority}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Share With</Label>
                            <Popover.Root>
                              <Popover.Trigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full justify-start"
                                >
                                  {sharedWith.size > 0
                                    ? `${sharedWith.size} employee(s) selected`
                                    : "Select employees to share with..."}
                                </Button>
                              </Popover.Trigger>
                              <Popover.Portal>
                                <Popover.Content
                                  className="z-50 w-[260px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                                  align="start"
                                  sideOffset={4}
                                >
                                  {employees
                                    .filter((emp) => emp.id !== taskForm.assignee)
                                    .map((emp) => {
                                      const isSelected = sharedWith.has(emp.id);
                                      return (
                                        <button
                                          type="button"
                                          key={emp.id}
                                          onClick={() => toggleSharedWith(emp.id)}
                                          className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                        >
                                          <div
                                            className={cn(
                                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                              isSelected
                                                ? "bg-primary text-primary-foreground"
                                                : "opacity-50"
                                            )}
                                          >
                                            {isSelected && <Check className="h-4 w-4" />}
                                          </div>
                                          <span>{emp.name}</span>
                                        </button>
                                      );
                                    })}
                                  {sharedWith.size > 0 && (
                                    <>
                                      <div className="-mx-1 my-1 h-px bg-muted" />
                                      <button
                                        type="button"
                                        onClick={() => setSharedWith(new Set())}
                                        className="flex w-full cursor-default select-none items-center justify-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                      >
                                        Clear all
                                      </button>
                                    </>
                                  )}
                                </Popover.Content>
                              </Popover.Portal>
                            </Popover.Root>
                            <p className="text-xs text-muted-foreground">
                              Additional employees who can see this task
                            </p>
                          </div>
                        </div>
                        <SheetFooter className="px-6 py-4 border-t shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setCreateTaskOpen(false);
                              resetTaskForm();
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={
                              isSubmittingTask ||
                              !taskForm.subject.trim() ||
                              !taskForm.phase ||
                              !taskForm.deadline
                            }
                          >
                            {isSubmittingTask ? "Creating..." : "Create Task"}
                          </Button>
                        </SheetFooter>
                      </form>
                    </SheetContent>
                  </Sheet>
                </CardHeader>
                <CardContent>
                  {tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tasks yet. Click "Add Task" to create your first task.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task: any) => {
                        const assignee = getAssigneeFromTask(task);
                        const sharedWithNames = getSharedWithFromTask(task);
                        return (
                          <div
                            key={task.name}
                            className="flex items-start justify-between p-3 rounded-lg border bg-muted/30 gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {task.subject}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {task.exp_end_date && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatDate(task.exp_end_date)}
                                  </span>
                                )}
                                {assignee && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    {assignee}
                                  </span>
                                )}
                                {sharedWithNames.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Users className="h-3 w-3" />
                                    +{sharedWithNames.length} shared
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {task.custom_wedding_phase && (
                                <Badge
                                  variant={stageBadgeVariant(task.custom_wedding_phase)}
                                  className="text-[10px]"
                                >
                                  {task.custom_wedding_phase}
                                </Badge>
                              )}
                              {task.priority && (
                                <Badge
                                  variant={
                                    task.priority === "High" ||
                                    task.priority === "Urgent"
                                      ? "destructive"
                                      : task.priority === "Medium"
                                      ? "warning"
                                      : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {task.priority}
                                </Badge>
                              )}
                              <Badge
                                variant={
                                  task.status === "Completed"
                                    ? "success"
                                    : task.status === "Cancelled"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-[10px]"
                              >
                                {task.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4">
              <InternalNotesSection
                references={[{ doctype: "Project", docName: name! }]}
              />
            </TabsContent>

            {/* Expenses Tab */}
            {showExpensesTab && (
              <TabsContent value="expenses" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle>Wedding Expenses</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total approved: {formatVND(approvedExpensesTotal)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setAddingExpense(true)} disabled={addingExpense}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Expense
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {expenseError && (
                      <div className="flex items-center gap-2 p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {expenseError}
                      </div>
                    )}
                    <div className="border rounded-md overflow-x-auto">
                      <table className="w-full text-sm">
                        <colgroup>
                          <col className="w-[130px]" />
                          <col />
                          <col className="w-[120px]" />
                          <col className="w-[140px]" />
                          <col className="w-[130px]" />
                          <col className="w-[90px]" />
                          <col className="w-[80px]" />
                        </colgroup>
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-2 py-2 w-10"></th>
                            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Date</th>
                            <th className="px-3 py-2 text-left font-medium">Description</th>
                            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">In charge by</th>
                            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Category</th>
                            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Amount</th>
                            <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-20">Status</th>
                            <th className="px-3 py-2 w-20"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenses.map((exp) => (
                            <tr key={exp.name} className="border-b last:border-b-0">
                              <td className="px-2 py-1.5 w-10">
                                {exp.receipt_url ? (
                                  <div className="relative group">
                                    <img
                                      src={`/api${exp.receipt_url}`}
                                      alt=""
                                      className="w-8 h-8 rounded object-cover cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                                      onClick={() => window.open(`/api${exp.receipt_url}`, "_blank")}
                                    />
                                    {exp.status === "Pending" && (
                                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                        <Pencil className="h-3 w-3 text-white" />
                                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          try {
                                            const { uploadFile } = await import("@/lib/fileUpload");
                                            await uploadFile(file, "Purchase Invoice", exp.name);
                                            fetchExpenses(name!);
                                          } catch {}
                                        }} />
                                      </label>
                                    )}
                                  </div>
                                ) : exp.status === "Pending" ? (
                                  <label className="flex items-center justify-center w-8 h-8 rounded bg-muted/50 hover:bg-muted cursor-pointer transition-colors">
                                    <Plus className="h-3 w-3 text-muted-foreground/50" />
                                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        const { uploadFile } = await import("@/lib/fileUpload");
                                        await uploadFile(file, "Purchase Invoice", exp.name);
                                        fetchExpenses(name!);
                                      } catch {}
                                    }} />
                                  </label>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {exp.status === "Pending" ? (
                                  <input
                                    type="date"
                                    className="h-7 w-[7.5rem] px-2 text-sm border border-transparent rounded hover:border-input focus:border-ring focus:outline-none bg-transparent cursor-pointer"
                                    defaultValue={exp.posting_date}
                                    onBlur={async (e) => {
                                      const newDate = e.target.value;
                                      if (newDate && newDate !== exp.posting_date) {
                                        try {
                                          await fetch(`/inquiry-api/expense/${exp.name}`, {
                                            method: "PUT",
                                            headers: { "Content-Type": "application/json" },
                                            credentials: "include",
                                            body: JSON.stringify({ date: newDate, amount: exp.amount }),
                                          });
                                          fetchExpenses(name!);
                                        } catch {}
                                      }
                                    }}
                                  />
                                ) : (
                                  formatDate(exp.posting_date)
                                )}
                              </td>
                              <td className="px-3 py-2">{exp.description}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {exp.staff ? (employees.find(e => e.id === exp.staff)?.name ?? exp.staff) : "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {exp.category || "—"}
                              </td>
                              <td className="px-3 py-2 text-right">{formatVND(exp.amount)}</td>
                              <td className="px-3 py-2">
                                <Badge variant={exp.status === "Approved" ? "success" : "warning"}>
                                  {exp.status}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1">
                                  {exp.status === "Pending" && isFinance && (
                                    <>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                        onClick={() => handleApproveExpense(exp.name)} title="Approve">
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleRejectExpense(exp.name)} title="Reject">
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  {(exp.status === "Pending" || isFinance) && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7"
                                      onClick={() => handleDeleteExpense(exp.name)} title="Delete">
                                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {addingExpense && (
                            <tr className="border-b last:border-b-0 bg-muted/30">
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2">
                                <Input className="h-8 w-full" type="date" value={newExpense.date}
                                  onChange={e => setNewExpense({ ...newExpense, date: e.target.value })} />
                              </td>
                              <td className="px-3 py-2">
                                <Input className="h-8 w-full" placeholder="Description" value={newExpense.description}
                                  onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} />
                              </td>
                              <td className="px-3 py-2">
                                <Select value={newExpense.staff || "__none__"} onValueChange={v => setNewExpense({ ...newExpense, staff: v === "__none__" ? "" : v })}>
                                  <SelectTrigger className="h-8 w-full text-sm">
                                    <SelectValue placeholder="Staff" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">—</SelectItem>
                                    {weddingTeam.map(m => (
                                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2">
                                <ShadcnPopover open={expCatOpen} onOpenChange={setExpCatOpen}>
                                  <ShadcnPopoverTrigger asChild>
                                    <button type="button" className="h-8 w-full flex items-center justify-between rounded-md border border-input bg-background px-2 text-sm truncate">
                                      <span className={newExpense.category ? "" : "text-muted-foreground"}>
                                        {newExpense.category
                                          ? (expenseCategories.find(c => c.name === newExpense.category)?.account_name ?? newExpense.category)
                                          : "Category"}
                                      </span>
                                      <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                                    </button>
                                  </ShadcnPopoverTrigger>
                                  <ShadcnPopoverContent className="w-[200px] p-0" align="start">
                                    <Command>
                                      <CommandInput placeholder="Search or create..." value={expCatSearch} onValueChange={setExpCatSearch} />
                                      <CommandList>
                                        <CommandEmpty>
                                          <div className="py-2 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">No match</p>
                                            {expCatSearch.trim() && (
                                              <Button type="button" variant="outline" size="sm" onClick={handleCreateExpCat} disabled={creatingExpCat}>
                                                <Plus className="h-3 w-3 mr-1" />{creatingExpCat ? "..." : `Create "${expCatSearch.trim()}"`}
                                              </Button>
                                            )}
                                          </div>
                                        </CommandEmpty>
                                        <CommandGroup>
                                          {expenseCategories
                                            .filter(c => !expCatSearch || c.account_name.toLowerCase().includes(expCatSearch.toLowerCase()))
                                            .map(c => (
                                              <CommandItem key={c.name} value={c.account_name} onSelect={() => { setNewExpense({ ...newExpense, category: c.name }); setExpCatOpen(false); }}>
                                                <Check className={cn("mr-2 h-3 w-3", newExpense.category === c.name ? "opacity-100" : "opacity-0")} />
                                                {c.account_name}
                                              </CommandItem>
                                            ))}
                                        </CommandGroup>
                                        {expCatSearch.trim() && expenseCategories.some(c => c.account_name.toLowerCase().includes(expCatSearch.toLowerCase())) && (
                                          <CommandGroup heading="Create new">
                                            <CommandItem value={`__create_${expCatSearch}`} onSelect={handleCreateExpCat}>
                                              <Plus className="mr-2 h-3 w-3" />Create "{expCatSearch.trim()}"
                                            </CommandItem>
                                          </CommandGroup>
                                        )}
                                      </CommandList>
                                    </Command>
                                  </ShadcnPopoverContent>
                                </ShadcnPopover>
                              </td>
                              <td className="px-3 py-2">
                                <Input className="h-8 w-full text-right" type="number" min="1" step="1" placeholder="Amount"
                                  value={newExpense.amount}
                                  onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} />
                              </td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2">
                                <input ref={expenseFileRef} type="file" accept="image/*,.pdf" className="hidden"
                                  onChange={e => setExpenseFile(e.target.files?.[0] ?? null)} />
                                <div className="flex gap-1">
                                  <Button type="button" variant={expenseFile ? "secondary" : "ghost"} size="icon" className="h-7 w-7"
                                    onClick={() => expenseFileRef.current?.click()} title={expenseFile ? expenseFile.name : "Attach receipt"}>
                                    {expenseFile ? <Paperclip className="h-4 w-4" /> : <Camera className="h-4 w-4 text-muted-foreground" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={handleAddExpense}
                                    disabled={!newExpense.description || !newExpense.amount || !newExpense.category || isSavingExpense}>
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => {
                                      setAddingExpense(false);
                                      setNewExpense({ date: new Date().toISOString().slice(0, 10), description: "", amount: "", category: "", staff: "" });
                                      setExpenseFile(null);
                                      if (expenseFileRef.current) expenseFileRef.current.value = "";
                                      setExpenseError(null);
                                    }}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {expenses.length === 0 && !addingExpense && (
                            <tr>
                              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                No expenses yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
      </div>

      {/* Add Payment Milestone Sheet */}
      <Sheet open={addMilestoneOpen} onOpenChange={(open) => { setAddMilestoneOpen(open); if (!open) setEditingMilestone(null); }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>{editingMilestone ? "Edit Payment Milestone" : "Add Payment Milestone"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleAddMilestone} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {milestoneError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {milestoneError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="milestone-label">Label</Label>
                <Input
                  id="milestone-label"
                  placeholder="e.g. Deposit, Second Payment"
                  value={milestoneForm.label}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="milestone-amount">Amount (VND) *</Label>
                {(() => {
                  const pkgRate = soItems.find((i) => i.item_code === "Wedding Planning Service")?.rate || 0;
                  const travelFee = soItems.find((i) => i.item_code === "Travel Fee")?.amount || 0;
                  const editingAmt = editingMilestone
                    ? (invoices.find((i: any) => i.name === editingMilestone)?.grand_total || 0)
                    : 0;
                  const remaining = Math.max(0, totalValue - totalInvoiced + editingAmt);
                  const presets = [
                    { label: "50% Deposit", amount: Math.round(pkgRate * 0.5) },
                    { label: "30% + Travel", amount: Math.round(pkgRate * 0.3) + travelFee },
                    { label: "Remaining", amount: Math.round(remaining) },
                  ];
                  return (
                <div className="flex gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => setMilestoneForm({ ...milestoneForm, amount: String(p.amount), label: p.label === "Remaining" ? "Final Payment" : p.label === "50% Deposit" ? "Deposit" : "Second Payment" })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                  );
                })()}
                <Input
                  id="milestone-amount"
                  type="number"
                  placeholder="25000000"
                  value={milestoneForm.amount}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, amount: e.target.value })}
                  required
                />
                {milestoneForm.amount && totalValue > 0 && (
                  <p className="text-xs text-muted-foreground">
                    = {Math.round((parseFloat(milestoneForm.amount) / totalValue) * 100)}% of total
                  </p>
                )}
                {(() => {
                  const editingAmount = editingMilestone
                    ? (invoices.find((i: any) => i.name === editingMilestone)?.grand_total || 0)
                    : 0;
                  const adjustedInvoiced = totalInvoiced - editingAmount;
                  const remaining = Math.max(0, totalValue - adjustedInvoiced);
                  return (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Remaining: {formatVND(remaining)}
                      </p>
                      {milestoneForm.amount &&
                        totalValue > 0 &&
                        parseFloat(milestoneForm.amount) > remaining && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Amount exceeds remaining unbilled ({formatVND(remaining)})
                          </p>
                        )}
                    </>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="milestone-invoice-date">Payment Date</Label>
                <Input
                  id="milestone-invoice-date"
                  type="date"
                  value={milestoneForm.invoiceDate}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, invoiceDate: e.target.value })}
                />
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              {editingMilestone && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={isSubmittingMilestone}
                  onClick={handleDeleteMilestone}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddMilestoneOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingMilestone || !milestoneForm.amount}
              >
                {isSubmittingMilestone ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingMilestone ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  editingMilestone ? "Update Milestone" : "Create Milestone"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Wedding Details Sheet (Venue + Add-ons) */}
      <Sheet open={editDetailsOpen} onOpenChange={(open) => { if (!isSubmittingEdit) { setEditDetailsOpen(open); setEditError(null); } }}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Edit Wedding Details</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSaveDetails} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {editError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {editError}
                </div>
              )}

              {/* Wedding Date */}
              <div className="space-y-2">
                <Label>Wedding Date</Label>
                <Input
                  type="date"
                  value={editForm.weddingDate}
                  onChange={(e) => setEditForm({ ...editForm, weddingDate: e.target.value })}
                />
              </div>

              {/* Venue */}
              <div className="space-y-2">
                <Label>Venue</Label>
                <ShadcnPopover open={editVenueOpen} onOpenChange={setEditVenueOpen}>
                  <ShadcnPopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors border-input bg-background hover:border-primary/50 focus:outline-none"
                    >
                      {editVenueDisplayName || editForm.venue || <span className="text-muted-foreground">Select venue...</span>}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  </ShadcnPopoverTrigger>
                  <ShadcnPopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search venues..."
                        value={editVenueSearch}
                        onValueChange={setEditVenueSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No venues found.</CommandEmpty>
                        <CommandGroup>
                          {venues.map((v) => (
                            <CommandItem
                              key={v.name}
                              value={v.supplier_name}
                              onSelect={() => {
                                setEditForm({ ...editForm, venue: v.name });
                                setEditVenueDisplayName(v.supplier_name);
                                setEditVenueOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", editForm.venue === v.name ? "opacity-100" : "opacity-0")} />
                              {v.supplier_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </ShadcnPopoverContent>
                </ShadcnPopover>
              </div>

              {/* Service Type */}
              <div className="space-y-2">
                <Label>Service Type</Label>
                <div className="flex gap-3">
                  {["Full Package", "Partial", "Coordinator"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, serviceType: editForm.serviceType === opt ? "" : opt })}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all",
                        editForm.serviceType === opt
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Package Amount — finance only */}
              {isFinance && (
              <div className="space-y-2">
                <Label htmlFor="edit-package-amount">Package Amount (VND)</Label>
                <Input
                  id="edit-package-amount"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 150000000"
                  value={editForm.packageAmount}
                  onChange={(e) => setEditForm({ ...editForm, packageAmount: e.target.value })}
                />
              </div>
              )}

              {/* Total Wedding Budget — finance only */}
              {isFinance && (
              <div className="space-y-2">
                <Label htmlFor="edit-total-budget">Total Wedding Budget (VND)</Label>
                <Input
                  id="edit-total-budget"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 500000000"
                  value={editForm.totalBudget}
                  onChange={(e) => setEditForm({ ...editForm, totalBudget: e.target.value })}
                />
              </div>
              )}

              {/* Tax Type */}
              <div className="space-y-2">
                <Label>Tax</Label>
                <div className="flex gap-3">
                  {[
                    { value: "tax_free" as const, label: "Tax Free" },
                    { value: "vat_included" as const, label: "VAT Included (8%)" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, taxType: opt.value })}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all",
                        editForm.taxType === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add-ons */}
              <div className="space-y-2">
                <Label>Add-ons</Label>
                {editForm.addOns.map((addon, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Add-on name..."
                        value={editAddonSearch[i] ?? addon.itemName}
                        onChange={(e) => {
                          const newSearch = [...editAddonSearch];
                          newSearch[i] = e.target.value;
                          setEditAddonSearch(newSearch);
                          const updated = editForm.addOns.map((a, j) =>
                            j === i ? { ...a, itemCode: "", itemName: e.target.value } : a
                          );
                          setEditForm({ ...editForm, addOns: updated });
                        }}
                        onFocus={() => {
                          const newOpen = [...editAddonDropdownOpen];
                          newOpen[i] = true;
                          setEditAddonDropdownOpen(newOpen);
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            const newOpen = [...editAddonDropdownOpen];
                            newOpen[i] = false;
                            setEditAddonDropdownOpen(newOpen);
                          }, 200);
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      {editAddonDropdownOpen[i] && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {availableAddOns
                            .filter((item) => !editAddonSearch[i] || item.item_name.toLowerCase().includes((editAddonSearch[i] ?? "").toLowerCase()))
                            .map((item) => (
                              <div
                                key={item.name}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const newSearch = [...editAddonSearch];
                                  newSearch[i] = item.item_name;
                                  setEditAddonSearch(newSearch);
                                  const updated = editForm.addOns.map((a, j) =>
                                    j === i ? {
                                      ...a,
                                      itemCode: item.name,
                                      itemName: item.item_name,
                                      includeInCommission: !!(item as any).custom_include_in_commission,
                                    } : a
                                  );
                                  setEditForm({ ...editForm, addOns: updated });
                                  const newOpen = [...editAddonDropdownOpen];
                                  newOpen[i] = false;
                                  setEditAddonDropdownOpen(newOpen);
                                }}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2"
                              >
                                {item.name === addon.itemCode && <Check className="h-3 w-3" />}
                                {item.item_name}
                              </div>
                            ))}
                          {(editAddonSearch[i] ?? "").length > 0 &&
                            !availableAddOns.some((item) => item.item_name.toLowerCase() === (editAddonSearch[i] ?? "").toLowerCase()) && (
                            <div
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleCreateEditAddon(i, editAddonSearch[i] ?? "", addon.includeInCommission);
                              }}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2 text-[#C4A962]"
                            >
                              {isCreatingAddon ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              Create "{editAddonSearch[i]}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      placeholder="Rate (VND)"
                      value={addon.rate || ""}
                      onChange={(e) => {
                        const updated = editForm.addOns.map((a, j) =>
                          j === i ? { ...a, rate: parseFloat(e.target.value) || 0 } : a
                        );
                        setEditForm({ ...editForm, addOns: updated });
                      }}
                      className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {isFinance && (
                    <label className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addon.includeInCommission}
                        onChange={(e) => {
                          const updated = editForm.addOns.map((a, j) =>
                            j === i ? { ...a, includeInCommission: e.target.checked } : a
                          );
                          setEditForm({ ...editForm, addOns: updated });
                        }}
                        className="accent-[#C4A962]"
                      />
                      Commission
                    </label>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        setEditForm({ ...editForm, addOns: editForm.addOns.filter((_, j) => j !== i) });
                        setEditAddonSearch((prev) => prev.filter((_, j) => j !== i));
                        setEditAddonDropdownOpen((prev) => prev.filter((_, j) => j !== i));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setEditForm({ ...editForm, addOns: [...editForm.addOns, { itemCode: "", itemName: "", qty: 1, rate: 0, includeInCommission: false }] });
                    setEditAddonSearch((prev) => [...prev, ""]);
                    setEditAddonDropdownOpen((prev) => [...prev, false]);
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
                >
                  <Plus className="h-4 w-4" />
                  Add item
                </button>
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setEditDetailsOpen(false)} disabled={isSubmittingEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Team Sheet (Staff) */}
      <Sheet open={editStaffOpen} onOpenChange={(open) => { if (!isSubmittingEdit) { setEditStaffOpen(open); setEditError(null); } }}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Edit Team</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSaveStaff} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {editError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {editError}
                </div>
              )}

              {/* Staff */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Lead Planner</Label>
                    <div className="flex items-center gap-2">
                      <Select value={editForm.leadPlanner || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, leadPlanner: v === "__none__" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isFinance && (
                      <div className="w-20 shrink-0">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          placeholder="%"
                          value={editForm.leadCommissionPct}
                          onChange={(e) => setEditForm({ ...editForm, leadCommissionPct: e.target.value })}
                          className="text-right text-sm"
                        />
                      </div>
                      )}
                    </div>
                    {isFinance && <p className="text-[10px] text-muted-foreground">Blank = use employee default rate</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Support Planner</Label>
                    <div className="flex items-center gap-2">
                      <Select value={editForm.supportPlanner || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, supportPlanner: v === "__none__" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isFinance && (
                      <div className="w-20 shrink-0">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          placeholder="%"
                          value={editForm.supportCommissionPct}
                          onChange={(e) => setEditForm({ ...editForm, supportCommissionPct: e.target.value })}
                          className="text-right text-sm"
                        />
                      </div>
                      )}
                    </div>
                    {isFinance && <p className="text-[10px] text-muted-foreground">Blank = use employee default rate</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Assistants</Label>
                    {(["assistant1", "assistant2", "assistant3", "assistant4", "assistant5"] as const).map((field, i) => (
                      <div key={field}>
                        <div className="flex items-center gap-2">
                          <Select value={editForm[field] || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, [field]: v === "__none__" ? "" : v })}>
                            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {employees.map((emp) => (
                                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {isFinance && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-muted-foreground flex-1">Assistant commission override</span>
                      <div className="w-20 shrink-0">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          placeholder="%"
                          value={editForm.assistantCommissionPct}
                          onChange={(e) => setEditForm({ ...editForm, assistantCommissionPct: e.target.value })}
                          className="text-right text-sm"
                        />
                      </div>
                    </div>
                    )}
                    {isFinance && <p className="text-[10px] text-muted-foreground">Blank = use employee default rate</p>}
                  </div>
                </div>
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setEditStaffOpen(false)} disabled={isSubmittingEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Sales Information Sheet */}
      <Sheet open={editSalesOpen} onOpenChange={(open) => { if (!isSubmittingEdit) { setEditSalesOpen(open); setEditError(null); } }}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Edit Sales Information</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSaveSales} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {editError}
                </div>
              )}
              <div className="space-y-2">
                <Label>Sold by</Label>
                <Select value={salesForm.salesPerson || "__none__"} onValueChange={(v) => setSalesForm({ ...salesForm, salesPerson: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Booking Date</Label>
                <Input type="date" value={salesForm.bookingDate} onChange={(e) => setSalesForm({ ...salesForm, bookingDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setEditSalesOpen(false)} disabled={isSubmittingEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Project Sheet - kept at root level to avoid remount flashing */}
      <Sheet open={deleteOpen} onOpenChange={(open) => { if (!isDeleting) { setDeleteOpen(open); setDeleteError(null); } }}>
        <SheetContent side="right" className="sm:max-w-sm flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Delete Project</SheetTitle>
          </SheetHeader>
          <div className="px-6 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Are you sure you want to delete this project? This action cannot be undone.</p>
            {deleteError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {deleteError}
              </div>
            )}
          </div>
          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : "Delete"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
