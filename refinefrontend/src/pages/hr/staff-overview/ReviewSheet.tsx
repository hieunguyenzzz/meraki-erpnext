import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { displayName } from "@/lib/format";
import { StaffSheet } from "./StaffSheet";
import type { StaffRow } from "./types";

interface Props {
  employee: StaffRow;
  onClose: () => void;
  onSaved: () => void;
}

/** Records the last review date and notes (PATCH /employee/{id}). Mount with a key per employee. */
export function ReviewSheet({ employee, onClose, onSaved }: Props) {
  const initialDate = employee.custom_last_review_date || new Date().toISOString().split("T")[0];
  const initialNotes = employee.custom_review_notes || "";
  const [reviewDate, setReviewDate] = useState(initialDate);
  const [reviewNotes, setReviewNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!reviewDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/employee/${employee.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { custom_last_review_date: reviewDate, custom_review_notes: reviewNotes } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `API error ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Saving review failed", err);
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  return (
    <StaffSheet
      open
      dirty={reviewDate !== initialDate || reviewNotes !== initialNotes}
      onClose={onClose}
      title="Review"
      subtitle={displayName(employee)}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !reviewDate}>{saving ? "Saving..." : "Save"}</Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="review-date">Review Date</Label>
        <Input id="review-date" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-notes">Notes</Label>
        <Textarea id="review-notes" placeholder="Add review notes..." value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} className="min-h-[120px]" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </StaffSheet>
  );
}
