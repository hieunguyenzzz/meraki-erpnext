import { useState } from "react";
import { Link } from "react-router";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Plus, Trash2, AlertCircle, CheckCircle2, ChevronsUpDown, Check, X } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// Constants
const SITE_NAME = "erp.merakiwp.com";
const DEFAULT_CASH_ACCOUNT = "Cash - MWP";
const COMPANY_NAME = "Meraki Wedding Planner";

interface Expense {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string;
  grand_total: number;
  outstanding_amount: number;
  status: string;
}

function statusVariant(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Overdue" || status === "Cancelled") return "destructive" as const;
  return "warning" as const;
}

interface ExpenseAccount {
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

// Expense accounts from ERPNext Chart of Accounts (static list)
const EXPENSE_ACCOUNTS: ExpenseAccount[] = [
  { name: "Office Expenses - MWP", account_name: "Office Expenses" },
  { name: "Marketing Expenses - MWP", account_name: "Marketing Expenses" },
  { name: "Travel Expenses - MWP", account_name: "Travel Expenses" },
  { name: "Software Expenses - MWP", account_name: "Software Expenses" },
  { name: "Miscellaneous Expenses - MWP", account_name: "Miscellaneous Expenses" },
  { name: "Administrative Expenses - MWP", account_name: "Administrative Expenses" },
  { name: "Entertainment Expenses - MWP", account_name: "Entertainment Expenses" },
  { name: "Equipment Expenses - MWP", account_name: "Equipment Expenses" },
  { name: "Utility Expenses - MWP", account_name: "Utility Expenses" },
  { name: "Telephone Expenses - MWP", account_name: "Telephone Expenses" },
];

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

const columns: ColumnDef<Expense, unknown>[] = [
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
    accessorKey: "supplier_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
    cell: ({ row }) => row.original.supplier_name || row.original.supplier,
    filterFn: "includesString",
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
    accessorKey: "outstanding_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Outstanding" className="text-right" />,
    cell: ({ row }) => <div className="text-right">{formatVND(row.original.outstanding_amount)}</div>,
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
];

export default function ExpensesPage() {
  const invalidate = useInvalidate();
  const { mutateAsync: createDoc } = useCreate();

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
        "grand_total", "outstanding_amount", "status",
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
  const expenseAccounts = EXPENSE_ACCOUNTS;
  const suppliers = (suppliersResult?.data ?? []) as Supplier[];
  const projects = (projectsResult?.data ?? []) as { name: string; project_name: string; customer: string; expected_end_date: string }[];
  const isLoading = query.isLoading;

  const filteredProjects = weddingSearch
    ? projects.filter(p => p.project_name.toLowerCase().includes(weddingSearch.toLowerCase()))
    : projects;

  // Reset quick expense form
  function resetQuickForm() {
    setQuickForm({ ...initialQuickForm, date: new Date().toISOString().slice(0, 10) });
    setWeddingSearch("");
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
      // Create Journal Entry
      const createResult = await createDoc({
        resource: "Journal Entry",
        values: {
          posting_date: quickForm.date,
          voucher_type: "Journal Entry",
          company: COMPANY_NAME,
          user_remark: quickForm.description,
          ...(quickForm.wedding ? { project: quickForm.wedding } : {}),
          accounts: [
            {
              account: quickForm.category,
              debit_in_account_currency: Math.round(amount),
              credit_in_account_currency: 0,
            },
            {
              account: DEFAULT_CASH_ACCOUNT,
              debit_in_account_currency: 0,
              credit_in_account_currency: Math.round(amount),
            },
          ],
        },
      });

      // Submit the Journal Entry
      if (createResult?.data?.name) {
        const submitRes = await fetch("/api/method/frappe.client.submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": SITE_NAME },
          credentials: "include",
          body: JSON.stringify({
            doc: { doctype: "Journal Entry", name: createResult.data.name },
          }),
        });

        if (!submitRes.ok) {
          const errorData = await submitRes.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to submit Journal Entry");
        }

        setQuickSuccess(`Journal Entry ${createResult.data.name} created successfully`);
        invalidate({ resource: "Journal Entry", invalidates: ["list"] });

        // Close dialog after short delay to show success message
        setTimeout(() => {
          setQuickExpenseOpen(false);
          resetQuickForm();
        }, 1500);
      }
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

    // Validate all amounts are positive
    const invalidAmount = invoiceForm.items.find(i => parseFloat(i.amount) <= 0);
    if (invalidAmount) {
      setInvoiceError("All amounts must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    setInvoiceError(null);
    setInvoiceSuccess(null);

    try {
      // Create Purchase Invoice
      const createResult = await createDoc({
        resource: "Purchase Invoice",
        values: {
          supplier: invoiceForm.supplier,
          posting_date: invoiceForm.date,
          company: COMPANY_NAME,
          items: invoiceForm.items.map((item) => ({
            item_code: "EXPENSE-ITEM",
            item_name: item.description,
            description: item.description,
            expense_account: item.category,
            qty: 1,
            rate: Math.round(parseFloat(item.amount)),
          })),
        },
      });

      // Submit the Purchase Invoice
      if (createResult?.data?.name) {
        const submitRes = await fetch("/api/method/frappe.client.submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": SITE_NAME },
          credentials: "include",
          body: JSON.stringify({
            doc: { doctype: "Purchase Invoice", name: createResult.data.name },
          }),
        });

        if (!submitRes.ok) {
          const errorData = await submitRes.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to submit Purchase Invoice");
        }

        setInvoiceSuccess(`Purchase Invoice ${createResult.data.name} created successfully`);
        invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });

        // Close dialog after short delay to show success message
        setTimeout(() => {
          setSupplierInvoiceOpen(false);
          resetInvoiceForm();
        }, 1500);
      }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Purchase invoices and supplier billing</p>
        </div>
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
                <Label htmlFor="quick-category">Category *</Label>
                <Select
                  value={quickForm.category}
                  onValueChange={(value) => setQuickForm({ ...quickForm, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map((acc) => (
                      <SelectItem key={acc.name} value={acc.name}>
                        {acc.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                            {expenseAccounts.map((acc) => (
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
