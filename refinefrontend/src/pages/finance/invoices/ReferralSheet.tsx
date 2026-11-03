import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronsUpDown, Check, Plus, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { todayVN } from "@/lib/businessTime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Partner } from "./types";

export interface WeddingOption {
  name: string;
  project_name: string;
  customer: string;
  expected_end_date: string;
}

const initialReferralForm = () => ({
  partner: "",
  amount: "",
  date: todayVN(),
  project: "",
  note: "",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: WeddingOption[];
  /** Called after the backend created the invoice. */
  onRecorded: () => void;
}

/** "Record referral commission" side sheet. Endpoints and payload are unchanged from the old page. */
export function ReferralSheet({ open, onOpenChange, projects, onRecorded }: Props) {
  const [referralForm, setReferralForm] = useState(initialReferralForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
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

  const filteredProjects = weddingSearch
    ? projects.filter(p => p.project_name.toLowerCase().includes(weddingSearch.toLowerCase()))
    : projects;

  // Fetch partners when the sheet opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/inquiry-api/referral/partners")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Partners failed: ${r.status}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setPartners(data); })
      .catch((error) => {
        console.error("Referral partners failed to load", error);
        if (!cancelled) setReferralError("Couldn't load partners. Close and reopen to try again.");
      });
    return () => { cancelled = true; };
  }, [open]);

  // Close the sheet shortly after success; cleared if the component unmounts first.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  function resetReferralForm() {
    setReferralForm(initialReferralForm());
    setPartnerSearch("");
    setWeddingSearch("");
    setReferralError(null);
    setReferralSuccess(null);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) resetReferralForm();
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
      console.error("Referral partner create failed", error);
      setReferralError(error instanceof Error ? error.message : "Failed to create partner");
    } finally {
      setCreatingPartner(false);
    }
  }

  async function handleReferralSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || referralSuccess) return; // a double tap or Enter after success must not create a second invoice
    const amount = parseFloat(referralForm.amount);
    if (!referralForm.partner || !referralForm.amount) return;
    if (amount <= 0) {
      setReferralError("Amount must be greater than 0");
      return;
    }

    submittingRef.current = true;
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
      onRecorded();

      closeTimer.current = setTimeout(() => handleOpenChange(false), 1500);
    } catch (error) {
      console.error("Referral record failed", error);
      setReferralError(error instanceof Error ? error.message : "Failed to record referral");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
              <div className="flex items-center gap-2 p-3 text-sm text-success-soft-foreground bg-success-soft rounded-md">
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
                    className="w-full flex min-h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                className="max-md:h-12"
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
                className="max-md:h-12"
              />
            </div>

            {/* Wedding */}
            <div className="space-y-2">
              <Label>Wedding (optional)</Label>
              <Popover open={weddingOpen} onOpenChange={setWeddingOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex min-h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <Button type="button" variant="outline" className="max-md:h-12" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="max-md:h-12"
              disabled={isSubmitting || !referralForm.partner || !referralForm.amount || !!referralSuccess}
            >
              {isSubmitting ? "Recording..." : "Record"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
