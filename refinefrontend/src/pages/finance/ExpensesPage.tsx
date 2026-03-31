import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useList, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Plus, Trash2, AlertCircle, CheckCircle2, ChevronsUpDown, Check, X, BadgeCheck, Pencil } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";


interface Expense {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string;
  grand_total: number;
  status: string;
  against_expense_account: string;
}

function statusVariant(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Overdue" || status === "Cancelled") return "destructive" as const;
  return "warning" as const;
}

interface ExpenseCategory {
  name: string;
  account_name: string;
}

interface Supplier {
  name: string;
  supplier_name: string;
}

interface InvoiceItem {
  description: string;
  category: string;
  amount: string;
}

// Initial form states
const initialQuickForm = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  category: "",
  wedding: "",
};

const initialInvoiceForm = {
  supplier: "",
  date: new Date().toISOString().slice(0, 10),
  items: [{ description: "", category: "", amount: "" }] as InvoiceItem[],
};

function getColumns(onEdit: (expense: Expense) => void): ColumnDef<Expense, unknown>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <Link to={`/finance/expenses/${row.original.name}`} className="font-medium text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "posting_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.original.posting_date),
    },
    {
      accessorKey: "grand_total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" className="text-right" />,
      cell: ({ row }) => <div className="text-right">{formatVND(row.original.grand_total)}</div>,
    },
    {
      accessorKey: "against_expense_account",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => {
        const acc = row.original.against_expense_account;
        if (!acc) return <span className="text-muted-foreground">—</span>;
        return acc.replace(/ - MWP$/, "");
      },
      filterFn: "arrIncludesSome",
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
      filterFn: "arrIncludesSome",
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row.original)}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export default function ExpensesPage() {
  const invalidate = useInvalidate();

  // Row selection state
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [bulkAction, setBulkAction] = useState<"deleting" | "paying" | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Edit expense state
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", description: "", date: "", account: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editCatOpen, setEditCatOpen] = useState(false);
  const [editCatSearch, setEditCatSearch] = useState("");

  // Dialog states
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [supplierInvoiceOpen, setSupplierInvoiceOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Feedback states
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<string | null>(null);

  // Quick Expense form state
  const [quickForm, setQuickForm] = useState(initialQuickForm);

  // Category combobox state
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Wedding combobox state
  const [weddingOpen, setWeddingOpen] = useState(false);
  const [weddingSearch, setWeddingSearch] = useState("");

  // Supplier Invoice form state
  const [invoiceForm, setInvoiceForm] = useState(initialInvoiceForm);

  const { result, query } = useList({
    resource: "Purchase Invoice",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: {
      fields: [
        "name", "supplier", "supplier_name", "posting_date",
        "grand_total", "status", "against_expense_account",
      ],
    },
  });

  // Fetch suppliers
  const { result: suppliersResult } = useList({
    resource: "Supplier",
    pagination: { mode: "off" },
    meta: { fields: ["name", "supplier_name"] },
  });

  // Fetch projects (weddings) for autocomplete
  const { result: projectsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name", "customer", "expected_end_date"] },
  });

  const expenses = (result?.data ?? []) as Expense[];
  const suppliers = (suppliersResult?.data ?? []) as Supplier[];
  const projects = (projectsResult?.data ?? []) as { name: string; project_name: string; customer: string; expected_end_date: string }[];
  const isLoading = query.isLoading;

  // Fetch expense categories from API
  useEffect(() => {
    fetch("/inquiry-api/expense/categories")
      .then(r => r.json())
      .then(data => setCategories(data))
      .catch(() => {});
  }, []);

  const filteredProjects = weddingSearch
    ? projects.filter(p => p.project_name.toLowerCase().includes(weddingSearch.toLowerCase()))
    : projects;

  // Reset quick expense form
  async function handleCreateCategory() {
    if (!categorySearch.trim()) return;
    setCreatingCategory(true);
    try {
      const resp = await fetch("/inquiry-api/expense/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categorySearch.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create category");
      }
      const newCat = await resp.json();
      setCategories(prev => [...prev, newCat]);
      setQuickForm({ ...quickForm, category: newCat.name });
      setCategoryOpen(false);
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : "Failed to create category");
    } finally {
      setCreatingCategory(false);
    }
  }

  function resetQuickForm() {
    setQuickForm({ ...initialQuickForm, date: new Date().toISOString().slice(0, 10) });
    setWeddingSearch("");
    setCategorySearch("");
    setQuickError(null);
    setQuickSuccess(null);
  }

  // Reset invoice form
  function resetInvoiceForm() {
    setInvoiceForm({ ...initialInvoiceForm, date: new Date().toISOString().slice(0, 10) });
    setInvoiceError(null);
    setInvoiceSuccess(null);
  }

  // Handle quick expense dialog close
  function handleQuickExpenseOpenChange(open: boolean) {
    setQuickExpenseOpen(open);
    if (!open) {
      resetQuickForm();
    }
  }

  // Handle supplier invoice dialog close
  function handleSupplierInvoiceOpenChange(open: boolean) {
    setSupplierInvoiceOpen(open);
    if (!open) {
      resetInvoiceForm();
    }
  }

  // Submit Journal Entry for quick expense
  async function handleQuickExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(quickForm.amount);
    if (!quickForm.description || !quickForm.amount || !quickForm.category) return;
    if (amount <= 0) {
      setQuickError("Amount must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    setQuickError(null);
    setQuickSuccess(null);

    try {
      const resp = await fetch("/inquiry-api/expense/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: quickForm.date,
          description: quickForm.description,
          amount,
          account: quickForm.category,
          project: quickForm.wedding || null,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create expense");
      }

      const result = await resp.json();
      setQuickSuccess(`Expense ${result.purchase_invoice} created successfully`);
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });

      setTimeout(() => {
        setQuickExpenseOpen(false);
        resetQuickForm();
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create expense";
      setQuickError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Submit Purchase Invoice for supplier invoice
  async function handleSupplierInvoiceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceForm.supplier || invoiceForm.items.some(i => !i.description || !i.category || !i.amount)) return;

    const invalidAmount = invoiceForm.items.find(i => parseFloat(i.amount) <= 0);
    if (invalidAmount) {
      setInvoiceError("All amounts must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    setInvoiceError(null);
    setInvoiceSuccess(null);

    try {
      const resp = await fetch("/inquiry-api/expense/supplier-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: invoiceForm.supplier,
          date: invoiceForm.date,
          items: invoiceForm.items.map((item) => ({
            description: item.description,
            account: item.category,
            amount: parseFloat(item.amount),
          })),
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create invoice");
      }

      const result = await resp.json();
      setInvoiceSuccess(`Purchase Invoice ${result.purchase_invoice} created successfully`);
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });

      setTimeout(() => {
        setSupplierInvoiceOpen(false);
        resetInvoiceForm();
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create invoice";
      setInvoiceError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Add item row for supplier invoice
  function addInvoiceItem() {
    setInvoiceForm({
      ...invoiceForm,
      items: [...invoiceForm.items, { description: "", category: "", amount: "" }],
    });
  }

  // Remove item row from supplier invoice
  function removeInvoiceItem(index: number) {
    if (invoiceForm.items.length <= 1) return;
    setInvoiceForm({
      ...invoiceForm,
      items: invoiceForm.items.filter((_, i) => i !== index),
    });
  }

  // Update invoice item
  function updateInvoiceItem(index: number, field: keyof InvoiceItem, value: string) {
    const items = [...invoiceForm.items];
    items[index] = { ...items[index], [field]: value };
    setInvoiceForm({ ...invoiceForm, items });
  }

  // Calculate invoice total
  const invoiceTotal = invoiceForm.items.reduce((sum, item) => {
    const amount = parseFloat(item.amount) || 0;
    return sum + amount;
  }, 0);

  const selectedNames = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedCount = selectedNames.length;

  async function handleDeleteSelected() {
    if (selectedCount === 0) return;
    if (!confirm(`Delete ${selectedCount} expense${selectedCount === 1 ? "" : "s"}? This cannot be undone.`)) return;

    setBulkAction("deleting");
    setBulkError(null);
    try {
      const names = selectedNames.map((idx) => expenses[Number(idx)]?.name).filter(Boolean);
      const res = await fetch("/inquiry-api/purchase-invoices/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Delete failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.failed?.length) {
        setBulkError(`Some failed: ${data.failed.join(", ")}`);
      }
      setRowSelection({});
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });
    } catch (err: any) {
      setBulkError(err.message || "Failed to delete expenses");
    } finally {
      setBulkAction(null);
    }
  }

  async function handleMarkPaidSelected() {
    if (selectedCount === 0) return;
    if (!confirm(`Mark ${selectedCount} expense${selectedCount === 1 ? "" : "s"} as paid?`)) return;

    setBulkAction("paying");
    setBulkError(null);
    try {
      const names = selectedNames.map((idx) => expenses[Number(idx)]?.name).filter(Boolean);
      const res = await fetch("/inquiry-api/purchase-invoices/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Mark paid failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.failed?.length) {
        setBulkError(`Some failed: ${data.failed.join(", ")}`);
      }
      setRowSelection({});
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });
    } catch (err: any) {
      setBulkError(err.message || "Failed to mark expenses as paid");
    } finally {
      setBulkAction(null);
    }
  }

  function openEditSheet(expense: Expense) {
    setEditExpense(expense);
    setEditForm({
      amount: String(expense.grand_total),
      description: "",  // will be fetched or left empty to keep existing
      date: expense.posting_date,
      account: expense.against_expense_account || "",
    });
    setEditError(null);
    setEditCatSearch("");
    setEditOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editExpense || !editForm.amount) return;
    setIsEditing(true);
    setEditError(null);
    try {
      const resp = await fetch(`/inquiry-api/expense/${editExpense.name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(editForm.amount),
          description: editForm.description || null,
          date: editForm.date || null,
          account: editForm.account || null,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to update expense");
      }
      setEditOpen(false);
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update expense");
    } finally {
      setIsEditing(false);
    }
  }

  const columns = getColumns(openEditSheet);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Purchase invoices and supplier billing</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleMarkPaidSelected} disabled={!!bulkAction}>
                <BadgeCheck className="mr-1.5 h-4 w-4" />
                {bulkAction === "paying" ? "Paying..." : `Mark ${selectedCount} paid`}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={!!bulkAction}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                {bulkAction === "deleting" ? "Deleting..." : `Delete ${selectedCount}`}
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Expense
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setQuickExpenseOpen(true)}>
                Quick Expense
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSupplierInvoiceOpen(true)}>
                Supplier Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bulkError && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{bulkError}</span>
          <button onClick={() => setBulkError(null)} className="ml-4 font-medium hover:text-red-900">&times;</button>
        </div>
      )}

      {/* Edit Expense Sheet */}
      <Sheet open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditExpense(null); }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Edit Expense</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  {editError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input id="edit-date" type="date" value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input id="edit-description" placeholder="Leave empty to keep existing"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount (VND) *</Label>
                <Input id="edit-amount" type="number" min="1" step="1" required
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Popover open={editCatOpen} onOpenChange={setEditCatOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <span className={editForm.account ? "" : "text-muted-foreground"}>
                        {editForm.account ? editForm.account.replace(/ - MWP$/, "") : "Keep existing"}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search..." value={editCatSearch} onValueChange={setEditCatSearch} />
                      <CommandList>
                        <CommandEmpty><p className="py-2 text-center text-sm text-muted-foreground">No match</p></CommandEmpty>
                        <CommandGroup>
                          {categories
                            .filter(c => !editCatSearch || c.account_name.toLowerCase().includes(editCatSearch.toLowerCase()))
                            .map(c => (
                              <CommandItem key={c.name} value={c.account_name} onSelect={() => { setEditForm({ ...editForm, account: c.name }); setEditCatOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", editForm.account === c.name ? "opacity-100" : "opacity-0")} />
                                {c.account_name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isEditing || !editForm.amount}>
                {isEditing ? "Saving..." : "Save"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Quick Expense Sheet */}
      <Sheet open={quickExpenseOpen} onOpenChange={handleQuickExpenseOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Add Quick Expense</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleQuickExpenseSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {quickError && (
                <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  {quickError}
                </div>
              )}
              {quickSuccess && (
                <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-md">
                  <CheckCircle2 className="h-4 w-4" />
                  {quickSuccess}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="quick-date">Date *</Label>
                <Input
                  id="quick-date"
                  type="date"
                  value={quickForm.date}
                  onChange={(e) => setQuickForm({ ...quickForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-description">Description *</Label>
                <Input
                  id="quick-description"
                  placeholder="e.g. Office supplies"
                  value={quickForm.description}
                  onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-amount">Amount (VND) *</Label>
                <Input
                  id="quick-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="500000"
                  value={quickForm.amount}
                  onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={quickForm.category ? "" : "text-muted-foreground"}>
                        {quickForm.category
                          ? (categories.find(c => c.name === quickForm.category)?.account_name ?? quickForm.category)
                          : "Search categories..."}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search or create..."
                        value={categorySearch}
                        onValueChange={setCategorySearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <div className="py-2 text-center">
                            <p className="text-sm text-muted-foreground mb-2">No categories found</p>
                            {categorySearch.trim() && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleCreateCategory}
                                disabled={creatingCategory}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                {creatingCategory ? "Creating..." : `Create "${categorySearch.trim()}"`}
                              </Button>
                            )}
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {categories
                            .filter(c => !categorySearch || c.account_name.toLowerCase().includes(categorySearch.toLowerCase()))
                            .map(c => (
                              <CommandItem
                                key={c.name}
                                value={c.account_name}
                                onSelect={() => {
                                  setQuickForm({ ...quickForm, category: c.name });
                                  setCategoryOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", quickForm.category === c.name ? "opacity-100" : "opacity-0")} />
                                {c.account_name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                        {categorySearch.trim() && categories.some(c => c.account_name.toLowerCase().includes(categorySearch.toLowerCase())) && (
                          <CommandGroup heading="Create new">
                            <CommandItem
                              value={`__create_${categorySearch}`}
                              onSelect={handleCreateCategory}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create "{categorySearch.trim()}"
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Wedding (optional)</Label>
                <Popover open={weddingOpen} onOpenChange={setWeddingOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={quickForm.wedding ? "" : "text-muted-foreground"}>
                        {quickForm.wedding
                          ? (projects.find(p => p.name === quickForm.wedding)?.project_name ?? quickForm.wedding)
                          : "Link to a wedding..."}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search weddings..."
                        value={weddingSearch}
                        onValueChange={setWeddingSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No weddings found.</CommandEmpty>
                        <CommandGroup>
                          {quickForm.wedding && (
                            <CommandItem
                              value="__clear__"
                              onSelect={() => {
                                setQuickForm({ ...quickForm, wedding: "" });
                                setWeddingOpen(false);
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Clear
                            </CommandItem>
                          )}
                          {filteredProjects.map(p => (
                            <CommandItem
                              key={p.name}
                              value={p.project_name}
                              onSelect={() => {
                                setQuickForm({ ...quickForm, wedding: p.name });
                                setWeddingOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", quickForm.wedding === p.name ? "opacity-100" : "opacity-0")} />
                              <div>
                                <p>{p.project_name}</p>
                                {p.expected_end_date && (
                                  <p className="text-xs text-muted-foreground">{formatDate(p.expected_end_date)}</p>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setQuickExpenseOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !quickForm.description || !quickForm.amount || !quickForm.category || !!quickSuccess}
              >
                {isSubmitting ? "Creating..." : "Create Expense"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Supplier Invoice Sheet */}
      <Sheet open={supplierInvoiceOpen} onOpenChange={handleSupplierInvoiceOpenChange}>
        <SheetContent side="right" className="sm:max-w-xl flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Add Supplier Invoice</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSupplierInvoiceSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {invoiceError && (
                <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  {invoiceError}
                </div>
              )}
              {invoiceSuccess && (
                <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-md">
                  <CheckCircle2 className="h-4 w-4" />
                  {invoiceSuccess}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoice-supplier">Supplier *</Label>
                  <Select
                    value={invoiceForm.supplier}
                    onValueChange={(value) => setInvoiceForm({ ...invoiceForm, supplier: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.supplier_name || s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice-date">Date *</Label>
                  <Input
                    id="invoice-date"
                    type="date"
                    value={invoiceForm.date}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Line Items *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-2">
                  {invoiceForm.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                      <div>
                        {index === 0 && <Label className="text-xs text-muted-foreground">Description</Label>}
                        <Input
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) => updateInvoiceItem(index, "description", e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        {index === 0 && <Label className="text-xs text-muted-foreground">Category</Label>}
                        <Select
                          value={item.category}
                          onValueChange={(value) => updateInvoiceItem(index, "category", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((acc) => (
                              <SelectItem key={acc.name} value={acc.name}>
                                {acc.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        {index === 0 && <Label className="text-xs text-muted-foreground">Amount</Label>}
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Amount"
                          className="w-32"
                          value={item.amount}
                          onChange={(e) => updateInvoiceItem(index, "amount", e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        {index === 0 && <Label className="text-xs text-muted-foreground">&nbsp;</Label>}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeInvoiceItem(index)}
                          disabled={invoiceForm.items.length <= 1}
                          className="h-10 w-10"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end text-sm">
                <span className="font-medium">Total: {formatVND(invoiceTotal)}</span>
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setSupplierInvoiceOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !invoiceForm.supplier ||
                  invoiceForm.items.some(i => !i.description || !i.category || !i.amount) ||
                  !!invoiceSuccess
                }
              >
                {isSubmitting ? "Creating..." : "Create Invoice"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <DataTable
        columns={columns}
        data={expenses}
        isLoading={isLoading}
        searchKey="supplier_name"
        searchPlaceholder="Search by supplier..."
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: [
              { label: "Paid", value: "Paid" },
              { label: "Unpaid", value: "Unpaid" },
              { label: "Overdue", value: "Overdue" },
              { label: "Cancelled", value: "Cancelled" },
            ],
          },
        ]}
      />
    </div>
  );
}
