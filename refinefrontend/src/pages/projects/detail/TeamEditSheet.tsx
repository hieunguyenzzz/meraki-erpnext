import { useEffect, useState } from "react";
import { useInvalidate, useUpdate } from "@refinedev/core";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { InlineError } from "./InlineError";
import type { WeddingData } from "./useWeddingData";

interface Props {
  w: WeddingData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edit panel for lead / support / assistants and (Finance only) commission overrides. */
export function TeamEditSheet({ w, open, onOpenChange }: Props) {
  const { name, project, employees, isFinance } = w;
  const invalidate = useInvalidate();
  const { mutateAsync: updateRecord } = useUpdate();
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    leadPlanner: "", supportPlanner: "", assistant1: "", assistant2: "", assistant3: "", assistant4: "", assistant5: "",
    leadCommissionPct: "", supportCommissionPct: "", assistantCommissionPct: "",
  });

  useEffect(() => {
    if (!open || !project) return;
    setEditError(null);
    setEditForm({
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSaveStaff(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateRecord({
        resource: "Project",
        id: name,
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
      invalidate({ resource: "Project", invalidates: ["detail"], id: name });
      onOpenChange(false);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save changes");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  return (
  <Sheet open={open} onOpenChange={(next) => { if (!isSubmittingEdit) { onOpenChange(next); setEditError(null); } }}>
    <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
      <SheetHeader className="px-6 py-4 border-b shrink-0">
        <SheetTitle>Edit Team</SheetTitle>
      </SheetHeader>
      <form onSubmit={handleSaveStaff} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <InlineError message={editError} />
  
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmittingEdit}>
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
  );
}
