import { useState } from "react";
import { Link } from "react-router";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import {
  Dialog, DialogContent, DialogHeader,
  DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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

  // Quick Expense form state
  const [quickForm, setQuickForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    category: "",
  });

  // Supplier Invoice form state
  const [invoiceForm, setInvoiceForm] = useState({
    supplier: "",
    date: new Date().toISOString().slice(0, 10),
    items: [{ description: "", category: "", amount: "" }] as InvoiceItem[],
  });

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

  const expenses = (result?.data ?? []) as Expense[];
  const expenseAccounts = EXPENSE_ACCOUNTS;
  const suppliers = (suppliersResult?.data ?? []) as Supplier[];
  const isLoading = query.isLoading;

  // Submit Journal Entry for quick expense
  async function handleQuickExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quickForm.description || !quickForm.amount || !quickForm.category) return;

    setIsSubmitting(true);
    try {
      // Create Journal Entry
      const result = await createDoc({
        resource: "Journal Entry",
        values: {
          posting_date: quickForm.date,
          voucher_type: "Journal Entry",
          company: "Meraki Wedding Planner",
          user_remark: quickForm.description,
          accounts: [
            {
              account: quickForm.category,
              debit_in_account_currency: parseFloat(quickForm.amount),
              credit_in_account_currency: 0,
            },
            {
              account: "Cash - MWP",
              debit_in_account_currency: 0,
              credit_in_account_currency: parseFloat(quickForm.amount),
            },
          ],
        },
      });

      // Submit the Journal Entry
      if (result?.data?.name) {
        await fetch("/api/method/frappe.client.submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": "erp.merakiwp.com" },
          credentials: "include",
          body: JSON.stringify({
            doc: { doctype: "Journal Entry", name: result.data.name },
          }),
        });
      }

      setQuickExpenseOpen(false);
      setQuickForm({
        date: new Date().toISOString().slice(0, 10),
        description: "",
        amount: "",
        category: "",
      });
      invalidate({ resource: "Journal Entry", invalidates: ["list"] });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Submit Purchase Invoice for supplier invoice
  async function handleSupplierInvoiceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceForm.supplier || invoiceForm.items.some(i => !i.description || !i.category || !i.amount)) return;

    setIsSubmitting(true);
    try {
      // Create Purchase Invoice
      const result = await createDoc({
        resource: "Purchase Invoice",
        values: {
          supplier: invoiceForm.supplier,
          posting_date: invoiceForm.date,
          company: "Meraki Wedding Planner",
          items: invoiceForm.items.map((item) => ({
            item_code: "EXPENSE-ITEM",
            item_name: item.description,
            description: item.description,
            expense_account: item.category,
            qty: 1,
            rate: parseFloat(item.amount),
          })),
        },
      });

      // Submit the Purchase Invoice
      if (result?.data?.name) {
        await fetch("/api/method/frappe.client.submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": "erp.merakiwp.com" },
          credentials: "include",
          body: JSON.stringify({
            doc: { doctype: "Purchase Invoice", name: result.data.name },
          }),
        });
      }

      setSupplierInvoiceOpen(false);
      setInvoiceForm({
        supplier: "",
        date: new Date().toISOString().slice(0, 10),
        items: [{ description: "", category: "", amount: "" }],
      });
      invalidate({ resource: "Purchase Invoice", invalidates: ["list"] });
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

      {/* Quick Expense Dialog */}
      <Dialog open={quickExpenseOpen} onOpenChange={setQuickExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Quick Expense</DialogTitle>
            <DialogDescription>
              Record a simple expense like petty cash or miscellaneous costs.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickExpenseSubmit} className="space-y-4">
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQuickExpenseOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !quickForm.description || !quickForm.amount || !quickForm.category}
              >
                {isSubmitting ? "Creating..." : "Create Expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supplier Invoice Dialog */}
      <Dialog open={supplierInvoiceOpen} onOpenChange={setSupplierInvoiceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Supplier Invoice</DialogTitle>
            <DialogDescription>
              Record a vendor invoice with line items.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSupplierInvoiceSubmit} className="space-y-4">
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSupplierInvoiceOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !invoiceForm.supplier ||
                  invoiceForm.items.some(i => !i.description || !i.category || !i.amount)
                }
              >
                {isSubmitting ? "Creating..." : "Create Invoice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
