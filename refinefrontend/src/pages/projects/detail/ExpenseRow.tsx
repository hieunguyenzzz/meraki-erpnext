import { useState } from "react";
import { Check, ChevronsUpDown, Eye, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover as ShadcnPopover, PopoverContent as ShadcnPopoverContent, PopoverTrigger as ShadcnPopoverTrigger } from "@/components/ui/popover";
import { RejectReasonForm } from "@/components/notifications/RejectReasonForm";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { ExpenseCategory } from "@/components/projects/ExpenseCategorySummary";
import { attachExpenseReceipt, deleteExpenseReceipt } from "@/lib/fileUpload";
import { formatDate, formatVNDFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Employee } from "./useWeddingData";

interface Props {
  exp: any;
  employees: Employee[];
  weddingTeam: Employee[];
  categories: ExpenseCategory[];
  isFinance: boolean;
  receiptBusy: boolean;
  onPreview: (url: string) => void;
  runReceiptAction: (piName: string, fallbackError: string, action: () => Promise<string | undefined | void>) => Promise<void>;
  onApprove: (piName: string) => void;
  onReject: (piName: string, reason: string) => void;
  onDelete: (piName: string) => void;
  /** Persist an edit; resolves once saved so the row can leave edit mode. */
  onSave: (piName: string, values: { date: string; description: string; amount: string; category: string; staff: string; note: string }, originalNote: string) => Promise<boolean>;
}

/** One expense: receipt thumbnail, then either the read-only cells or the inline edit cells. */
export function ExpenseRow({ exp, employees, weddingTeam, categories: expenseCategories, isFinance, receiptBusy, onPreview, runReceiptAction, onApprove, onReject, onDelete, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editExpValues, setEditExpValues] = useState({ date: "", description: "", amount: "", category: "", staff: "", note: "" });
  const [editExpCatOpen, setEditExpCatOpen] = useState(false);

  function startEditExpense() {
    setEditing(true);
    setEditExpValues({
      date: exp.posting_date || "",
      description: exp.description || "",
      amount: String(exp.amount || ""),
      category: exp.account || "",
      staff: exp.staff || "",
      note: exp.note || "",
    });
  }

  async function saveEdit() {
    if (await onSave(exp.name, editExpValues, exp.note || "")) setEditing(false);
  }

  return (
    <tr className="border-b last:border-b-0">
          <td className="px-2 py-1.5 w-10">
            {exp.receipt_url ? (
              <div className="relative group w-12 h-12">
                <img
                  src={exp.receipt_url}
                  alt=""
                  className="w-12 h-12 rounded object-cover"
                />
                {receiptBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                    <Loader2 className="h-4 w-4 text-white animate-spin" />
                  </div>
                )}
                <div className={`absolute inset-0 flex items-center justify-center gap-1 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-zoom-in ${receiptBusy ? "hidden" : ""}`}
                  onClick={() => onPreview(exp.receipt_url)}
                  title="Preview"
                >
                  {exp.status !== "Pending" && (
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      onClick={() => onPreview(exp.receipt_url)}
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5 text-white" />
                    </button>
                  )}
                  {exp.status === "Pending" && (
                    <label className="p-1 rounded hover:bg-white/20 transition-colors cursor-pointer" title="Replace" onClick={(e) => e.stopPropagation()}>
                      <Pencil className="h-3.5 w-3.5 text-white" />
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                        const input = e.target;
                        const file = input.files?.[0];
                        if (!file) return;
                        await runReceiptAction(exp.name, "Failed to replace receipt", async () =>
                          (await attachExpenseReceipt(file, exp.name, { replace: true })).warning);
                        input.value = "";
                      }} />
                    </label>
                  )}
                  {exp.status === "Pending" && (
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-white/20 transition-colors"
                      title="Delete receipt"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm("Delete this receipt?")) return;
                        await runReceiptAction(exp.name, "Failed to delete receipt", () => deleteExpenseReceipt(exp.name).then(() => undefined));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-white" />
                    </button>
                  )}
                </div>
              </div>
            ) : receiptBusy ? (
              <div className="flex items-center justify-center w-12 h-12 rounded bg-muted">
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              </div>
            ) : exp.status === "Pending" ? (
              <label className="flex items-center justify-center w-12 h-12 rounded bg-muted/50 hover:bg-muted cursor-pointer transition-colors">
                <Plus className="h-4 w-4 text-muted-foreground/40" />
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await runReceiptAction(exp.name, "Failed to attach receipt", () => attachExpenseReceipt(file, exp.name).then(() => undefined));
                }} />
              </label>
            ) : null}
          </td>
          {editing ? (
            <>
              <td className="px-3 py-2">
                <input type="date" className="h-8 w-full px-1 text-sm border rounded border-input bg-background"
                  value={editExpValues.date} onChange={e => setEditExpValues({ ...editExpValues, date: e.target.value })} />
              </td>
              <td className="px-3 py-2">
                <Input className="h-8 w-full" value={editExpValues.description}
                  onChange={e => setEditExpValues({ ...editExpValues, description: e.target.value })} />
                <Input className="h-8 w-full mt-1" placeholder="Note (optional)" maxLength={1000} value={editExpValues.note}
                  onChange={e => setEditExpValues({ ...editExpValues, note: e.target.value })} />
              </td>
              <td className="px-3 py-2">
                <Select value={editExpValues.staff || "__none__"} onValueChange={v => setEditExpValues({ ...editExpValues, staff: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="h-8 w-full text-sm"><SelectValue placeholder="Staff" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {weddingTeam.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-3 py-2">
                <ShadcnPopover open={editExpCatOpen} onOpenChange={setEditExpCatOpen}>
                  <ShadcnPopoverTrigger asChild>
                    <button type="button" className="h-8 w-full flex items-center justify-between rounded-md border border-input bg-background px-2 text-sm truncate">
                      <span className={editExpValues.category ? "" : "text-muted-foreground"}>
                        {editExpValues.category ? (expenseCategories.find(c => c.name === editExpValues.category)?.account_name ?? editExpValues.category) : "Category"}
                      </span>
                      <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                    </button>
                  </ShadcnPopoverTrigger>
                  <ShadcnPopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search..." />
                      <CommandList>
                        <CommandEmpty>No match</CommandEmpty>
                        <CommandGroup>
                          {expenseCategories.map(c => (
                            <CommandItem key={c.name} value={c.account_name} onSelect={() => { setEditExpValues({ ...editExpValues, category: c.name }); setEditExpCatOpen(false); }}>
                              <Check className={cn("mr-2 h-3 w-3", editExpValues.category === c.name ? "opacity-100" : "opacity-0")} />
                              {c.account_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </ShadcnPopoverContent>
                </ShadcnPopover>
              </td>
              <td className="px-3 py-2">
                <MoneyInput className="h-8 w-full text-right"
                  value={editExpValues.amount} onChange={(raw) => setEditExpValues({ ...editExpValues, amount: raw })} />
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}
                    disabled={!editExpValues.description || !editExpValues.amount} title="Save">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)} title="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </>
          ) : (
            <>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(exp.posting_date)}</td>
              <td className="px-3 py-2">
                {exp.description}
                {exp.note && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2" title={exp.note}>{exp.note}</div>}
                {exp.status === "Rejected" && exp.rejected_reason && (
                  <div className="mt-0.5 text-xs text-danger-soft-foreground break-words">Rejected: “{exp.rejected_reason}”</div>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {exp.staff ? (employees.find(e => e.id === exp.staff)?.name ?? exp.staff) : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{exp.category || "—"}</td>
              <td className="px-3 py-2 text-right">{formatVNDFull(exp.amount)}</td>
              <td className="px-3 py-2">
                <Badge variant={exp.status === "Approved" ? "success" : exp.status === "Rejected" ? "destructive" : "warning"}>{exp.status}</Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {(exp.status === "Pending" || exp.status === "Rejected") && (
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => startEditExpense()} title={exp.status === "Rejected" ? "Edit and send back to Finance" : "Edit"}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                  {exp.status === "Pending" && isFinance && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => onApprove(exp.name)} title="Approve">
                        <Check className="h-4 w-4" />
                      </Button>
                      <ShadcnPopover open={rejectOpen} onOpenChange={setRejectOpen}>
                        <ShadcnPopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Reject">
                            <X className="h-4 w-4" />
                          </Button>
                        </ShadcnPopoverTrigger>
                        <ShadcnPopoverContent align="end" className="w-80">
                          <RejectReasonForm compact onCancel={() => setRejectOpen(false)}
                            onConfirm={(reason) => { setRejectOpen(false); onReject(exp.name, reason); }} />
                        </ShadcnPopoverContent>
                      </ShadcnPopover>
                    </>
                  )}
                  {(exp.status === "Pending" || isFinance) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => onDelete(exp.name)} title="Delete">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </td>
            </>
          )}
    </tr>
  );
}
