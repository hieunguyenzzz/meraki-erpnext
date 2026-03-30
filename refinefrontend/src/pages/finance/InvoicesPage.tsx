import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useList, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, AlertCircle, CheckCircle2, ChevronsUpDown, Check, X, Trash2 } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

interface Invoice {
  name: string;
  customer: string;
  customer_name: string;
  posting_date: string;
  grand_total: number;
  outstanding_amount: number;
  status: string;
}

interface Partner {
  name: string;
  customer_name: string;
}

const columns: ColumnDef<Invoice, unknown>[] = [
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
    header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
    cell: ({ row }) => (
      <Link to={`/finance/invoices/${row.original.name}`} className="font-medium text-primary hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "customer_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
    cell: ({ row }) => row.original.customer_name,
    filterFn: "includesString",
  },
  {
    accessorKey: "posting_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => formatDate(row.original.posting_date),
  },
  {
    accessorKey: "grand_total",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="text-right" />,
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
      <Badge variant={row.original.status === "Paid" ? "success" : row.original.status === "Overdue" ? "destructive" : "warning"}>
        {row.original.status}
      </Badge>
    ),
    filterFn: "arrIncludesSome",
  },
];

const initialReferralForm = {
  partner: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  project: "",
  note: "",
};

export default function InvoicesPage() {
  const invalidate = useInvalidate();

  // Row selection state
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Referral sheet state
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralForm, setReferralForm] = useState(initialReferralForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralSuccess, setReferralSuccess] = useState<string | null>(null);

  // Partner combobox state
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [creatingPartner, setCreatingPartner] = useState(false);

  // Wedding combobox state
  const [weddingOpen, setWeddingOpen] = useState(false);
  const [weddingSearch, setWeddingSearch] = useState("");

  const { result, query } = useList({
    resource: "Sales Invoice",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "customer", "customer_name", "posting_date", "grand_total", "outstanding_amount", "status"] },
  });

  // Fetch projects for wedding dropdown
  const { result: projectsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name", "customer", "expected_end_date"] },
  });

  const invoices = (result?.data ?? []) as Invoice[];
  const projects = (projectsResult?.data ?? []) as { name: string; project_name: string; customer: string; expected_end_date: string }[];
  const isLoading = query.isLoading;

  const filteredProjects = weddingSearch
    ? projects.filter(p => p.project_name.toLowerCase().includes(weddingSearch.toLowerCase()))
    : projects;

  // Fetch partners when sheet opens
  useEffect(() => {
    if (referralOpen) {
      fetch("/inquiry-api/referral/partners")
        .then(r => r.json())
        .then(data => setPartners(data))
        .catch(() => {});
    }
  }, [referralOpen]);

  function resetReferralForm() {
    setReferralForm({ ...initialReferralForm, date: new Date().toISOString().slice(0, 10) });
    setPartnerSearch("");
    setWeddingSearch("");
    setReferralError(null);
    setReferralSuccess(null);
  }

  function handleReferralOpenChange(open: boolean) {
    setReferralOpen(open);
    if (!open) resetReferralForm();
  }

  async function handleCreatePartner() {
    if (!partnerSearch.trim()) return;
    setCreatingPartner(true);
    try {
      const resp = await fetch("/inquiry-api/referral/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: partnerSearch.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create partner");
      }
      const newPartner = await resp.json();
      setPartners(prev => [...prev, newPartner]);
      setReferralForm({ ...referralForm, partner: newPartner.name });
      setPartnerOpen(false);
    } catch (error) {
      setReferralError(error instanceof Error ? error.message : "Failed to create partner");
    } finally {
      setCreatingPartner(false);
    }
  }

  async function handleReferralSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(referralForm.amount);
    if (!referralForm.partner || !referralForm.amount) return;
    if (amount <= 0) {
      setReferralError("Amount must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    setReferralError(null);
    setReferralSuccess(null);

    try {
      const resp = await fetch("/inquiry-api/referral/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner: referralForm.partner,
          amount,
          date: referralForm.date,
          project: referralForm.project || null,
          note: referralForm.note || null,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to record referral");
      }

      const result = await resp.json();
      setReferralSuccess(`Invoice ${result.invoice} created and paid`);
      invalidate({ resource: "Sales Invoice", invalidates: ["list"] });

      setTimeout(() => {
        setReferralOpen(false);
        resetReferralForm();
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to record referral";
      setReferralError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedNames = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedCount = selectedNames.length;

  async function handleDeleteSelected() {
    if (selectedCount === 0) return;
    if (!confirm(`Delete ${selectedCount} invoice${selectedCount === 1 ? "" : "s"}? Submitted invoices will be cancelled first.`)) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const names = selectedNames.map((idx) => invoices[Number(idx)]?.name).filter(Boolean);
      const res = await fetch("/inquiry-api/sales-invoices/delete", {
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
        setDeleteError(`Some invoices failed: ${data.failed.join(", ")}`);
      }
      setRowSelection({});
      invalidate({ resource: "Sales Invoice", invalidates: ["list"] });
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete invoices");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Invoices</h1>
          <p className="text-muted-foreground">Track revenue and customer billing</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={deleting}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              {deleting ? "Deleting..." : `Delete ${selectedCount} selected`}
            </Button>
          )}
          <Button onClick={() => setReferralOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Record Referral
          </Button>
        </div>
      </div>

      {/* Record Referral Sheet */}
      <Sheet open={referralOpen} onOpenChange={handleReferralOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Record Referral Commission</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleReferralSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {referralError && (
                <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {referralError}
                </div>
              )}
              {referralSuccess && (
                <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-md">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {referralSuccess}
                </div>
              )}

              {/* Partner */}
              <div className="space-y-2">
                <Label>Partner *</Label>
                <Popover open={partnerOpen} onOpenChange={setPartnerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={referralForm.partner ? "" : "text-muted-foreground"}>
                        {referralForm.partner
                          ? (partners.find(p => p.name === referralForm.partner)?.customer_name ?? referralForm.partner)
                          : "Search partners..."}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search partners..."
                        value={partnerSearch}
                        onValueChange={setPartnerSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <div className="py-2 text-center">
                            <p className="text-sm text-muted-foreground mb-2">No partners found</p>
                            {partnerSearch.trim() && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleCreatePartner}
                                disabled={creatingPartner}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                {creatingPartner ? "Creating..." : `Create "${partnerSearch.trim()}"`}
                              </Button>
                            )}
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {referralForm.partner && (
                            <CommandItem
                              value="__clear__"
                              onSelect={() => {
                                setReferralForm({ ...referralForm, partner: "" });
                                setPartnerOpen(false);
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Clear
                            </CommandItem>
                          )}
                          {partners
                            .filter(p => !partnerSearch || p.customer_name.toLowerCase().includes(partnerSearch.toLowerCase()))
                            .map(p => (
                              <CommandItem
                                key={p.name}
                                value={p.customer_name}
                                onSelect={() => {
                                  setReferralForm({ ...referralForm, partner: p.name });
                                  setPartnerOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", referralForm.partner === p.name ? "opacity-100" : "opacity-0")} />
                                {p.customer_name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                        {partnerSearch.trim() && partners.some(p => p.customer_name.toLowerCase().includes(partnerSearch.toLowerCase())) && (
                          <CommandGroup heading="Create new">
                            <CommandItem
                              value={`__create_${partnerSearch}`}
                              onSelect={handleCreatePartner}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create "{partnerSearch.trim()}"
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="referral-amount">Amount (VND) *</Label>
                <Input
                  id="referral-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="5000000"
                  value={referralForm.amount}
                  onChange={(e) => setReferralForm({ ...referralForm, amount: e.target.value })}
                  required
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="referral-date">Date</Label>
                <Input
                  id="referral-date"
                  type="date"
                  value={referralForm.date}
                  onChange={(e) => setReferralForm({ ...referralForm, date: e.target.value })}
                  required
                />
              </div>

              {/* Wedding */}
              <div className="space-y-2">
                <Label>Wedding (optional)</Label>
                <Popover open={weddingOpen} onOpenChange={setWeddingOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={referralForm.project ? "" : "text-muted-foreground"}>
                        {referralForm.project
                          ? (projects.find(p => p.name === referralForm.project)?.project_name ?? referralForm.project)
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
                          {referralForm.project && (
                            <CommandItem
                              value="__clear__"
                              onSelect={() => {
                                setReferralForm({ ...referralForm, project: "" });
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
                                setReferralForm({ ...referralForm, project: p.name });
                                setWeddingOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", referralForm.project === p.name ? "opacity-100" : "opacity-0")} />
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

              {/* Note */}
              <div className="space-y-2">
                <Label htmlFor="referral-note">Note (optional)</Label>
                <Textarea
                  id="referral-note"
                  placeholder="e.g. Decor referral for Nguyen-Tran wedding"
                  value={referralForm.note}
                  onChange={(e) => setReferralForm({ ...referralForm, note: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <SheetFooter className="px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => setReferralOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !referralForm.partner || !referralForm.amount || !!referralSuccess}
              >
                {isSubmitting ? "Recording..." : "Record"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {deleteError && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-4 font-medium hover:text-red-900">&times;</button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        searchKey="customer_name"
        searchPlaceholder="Search by customer..."
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
              { label: "Return", value: "Return" },
            ],
          },
        ]}
      />
    </div>
  );
}
