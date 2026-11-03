import { useRef, useState } from "react";
import { Camera, Check, ChevronsUpDown, Loader2, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover as ShadcnPopover, PopoverContent as ShadcnPopoverContent, PopoverTrigger as ShadcnPopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { ExpenseCategory } from "@/components/projects/ExpenseCategorySummary";
import { attachExpenseReceipt } from "@/lib/fileUpload";
import { todayVN } from "@/lib/businessTime";
import { cn } from "@/lib/utils";
import type { Employee } from "./useWeddingData";

interface Props {
  projectName: string;
  weddingTeam: Employee[];
  categories: ExpenseCategory[];
  onCategoryCreated: (c: ExpenseCategory) => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  onCancel: () => void;
}

const blank = () => ({ date: todayVN(), description: "", amount: "", category: "", staff: "", note: "" });

/** Inline "add expense" row at the top of the expenses table. */
export function NewExpenseRow({ projectName, weddingTeam, categories: expenseCategories, onCategoryCreated, onError: setExpenseError, onSaved, onCancel }: Props) {
  const [newExpense, setNewExpense] = useState(blank);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [expenseFile, setExpenseFile] = useState<File | null>(null);
  const [expCatOpen, setExpCatOpen] = useState(false);
  const [expCatSearch, setExpCatSearch] = useState("");
  const [creatingExpCat, setCreatingExpCat] = useState(false);
  const expenseFileRef = useRef<HTMLInputElement>(null);

  async function handleCreateExpCat() {
    if (!expCatSearch.trim()) return;
    setCreatingExpCat(true);
    try {
      const resp = await fetch("/inquiry-api/expense/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: expCatSearch.trim(), scope: "wedding" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create category");
      }
      const newCat = await resp.json();
      onCategoryCreated(newCat);
      setNewExpense(prev => ({ ...prev, category: newCat.name }));
      setExpCatOpen(false);
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to create category");
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
          project: projectName,
          date: newExpense.date,
          description: newExpense.description,
          amount: parseFloat(newExpense.amount),
          category: newExpense.category,
          ...(newExpense.staff ? { staff: newExpense.staff } : {}),
          ...(newExpense.note.trim() ? { note: newExpense.note.trim() } : {}),
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
          await attachExpenseReceipt(expenseFile, result.name);
        } catch (err) {
          console.error("Receipt upload failed:", err);
        }
      }
      onSaved();
    } catch (error) {
      setExpenseError(error instanceof Error ? error.message : "Failed to create expense");
    } finally {
      setIsSavingExpense(false);
    }
  }

  return (
    <tr className="border-b bg-muted/30">
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2">
        <Input className="h-8 w-full" type="date" value={newExpense.date}
          onChange={e => setNewExpense({ ...newExpense, date: e.target.value })} />
      </td>
      <td className="px-3 py-2">
        <Input className="h-8 w-full" placeholder="Description" value={newExpense.description}
          onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} />
        <Input className="h-8 w-full mt-1" placeholder="Note (optional)" maxLength={1000} value={newExpense.note}
          onChange={e => setNewExpense({ ...newExpense, note: e.target.value })} />
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
        <MoneyInput className="h-8 w-full text-right" placeholder="Amount"
          value={newExpense.amount}
          onChange={(raw) => setNewExpense({ ...newExpense, amount: raw })} />
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
            {isSavingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => {
              setExpenseError(null);
              onCancel();
            }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
