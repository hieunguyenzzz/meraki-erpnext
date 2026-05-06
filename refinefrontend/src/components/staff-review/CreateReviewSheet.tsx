import { useState, useEffect, useMemo } from "react";
import { useList } from "@refinedev/core";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedRating } from "./SegmentedRating";
import { ClipboardCheck } from "lucide-react";

interface Criterion {
  name: string;
  criterion_name: string;
  sort_order: number;
}

interface CreateReviewSheetProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated: () => void;
  presetEmployee?: string;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function CreateReviewSheet({
  open,
  onOpenChange,
  onCreated,
  presetEmployee,
}: CreateReviewSheetProps) {
  const [employee, setEmployee] = useState(presetEmployee ?? "");
  const [reviewDate, setReviewDate] = useState(todayISO());
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [overallScore, setOverallScore] = useState<number | undefined>(undefined);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([]);

  // Sync preset employee when it changes
  useEffect(() => {
    if (presetEmployee) setEmployee(presetEmployee);
  }, [presetEmployee]);

  // Fetch criteria once on mount (and when sheet opens)
  useEffect(() => {
    if (!open) return;
    fetch("/inquiry-api/reviews/criteria", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setCriteria(data.criteria ?? []))
      .catch(() => setCriteria([]));
  }, [open]);

  const { result: employeesResult, query: empQuery } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    sorters: [{ field: "employee_name", order: "asc" }],
    meta: { fields: ["name", "employee_name", "designation"] },
    queryOptions: { enabled: open },
  });
  const employees = (employeesResult?.data ?? []) as any[];

  const computedAverage = useMemo(() => {
    const values = Object.values(ratings);
    if (values.length === 0) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }, [ratings]);

  const canSave =
    !!employee &&
    !!reviewDate &&
    criteria.length > 0 &&
    Object.keys(ratings).length === criteria.length;

  function reset() {
    setEmployee(presetEmployee ?? "");
    setReviewDate(todayISO());
    setPeriod("");
    setNotes("");
    setOverallScore(undefined);
    setRatings({});
    setError("");
  }

  function handleOpenChange(b: boolean) {
    if (!b) reset();
    onOpenChange(b);
  }

  async function handleSave() {
    setSubmitting(true);
    setError("");
    try {
      const body = {
        employee,
        review_date: reviewDate,
        period: period || null,
        notes,
        overall_score: overallScore ?? null,
        ratings: Object.entries(ratings).map(([criterion, score]) => ({ criterion, score })),
      };
      const res = await fetch("/inquiry-api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }
      reset();
      onCreated();
    } catch (err: any) {
      setError(err?.message || "Failed to save review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            New Staff Review
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label>Employee <span className="text-destructive">*</span></Label>
            <Select
              value={employee || "__none__"}
              onValueChange={(v) => setEmployee(v === "__none__" ? "" : v)}
              disabled={!!presetEmployee}
            >
              <SelectTrigger>
                <SelectValue placeholder={empQuery.isLoading ? "Loading..." : "Select employee"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Select employee —</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.name} value={e.name}>
                    {e.employee_name}{e.designation ? ` (${e.designation})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Review Date <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
            />
          </div>

          {/* Period */}
          <div className="space-y-1.5">
            <Label>Period</Label>
            <Input
              placeholder="e.g. Q2 2026"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>

          {/* Criteria ratings */}
          {criteria.length > 0 && (
            <div className="space-y-3">
              <Label>Ratings <span className="text-destructive">*</span></Label>
              {criteria.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-3">
                  <span className="font-medium text-sm shrink-0 w-36">{c.criterion_name}</span>
                  <SegmentedRating
                    value={ratings[c.criterion_name] ?? null}
                    onChange={(n) => setRatings((prev) => ({ ...prev, [c.criterion_name]: n }))}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={4}
              placeholder="Observations, highlights, areas for improvement..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Overall override */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Overall Score (optional override)</Label>
            <div className="flex items-center gap-3">
              <SegmentedRating
                value={overallScore ?? null}
                onChange={setOverallScore}
                size="sm"
                className="flex-1"
              />
              {overallScore !== undefined && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => setOverallScore(undefined)}
                >
                  Clear
                </button>
              )}
            </div>
            {computedAverage !== null && (
              <p className="text-xs text-muted-foreground">
                Computed average: {computedAverage.toFixed(1)}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter className="px-6 py-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || submitting}>
            {submitting ? "Saving..." : "Save Review"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
