import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { useOne, useInvalidate } from "@refinedev/core";
import { ArrowLeft, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { StatePanel } from "@/components/StatePanel";
import { rampColor } from "@/components/staff-review/SegmentedRating";
import { DetailsCard, RatingsCard } from "./staff-reviews/ReviewEditCards";
import { useReviewCriteria } from "./staff-reviews/useReviewCriteria";
import { isoDate, notesToPlain, reviewScore } from "./staff-reviews/reviewUtils";

interface RatingRow {
  criterion: string;
  score: number;
}

interface MerakiReviewFull {
  name: string;
  employee: string;
  employee_name?: string;
  review_date: string;
  period?: string;
  notes?: string;
  modified?: string;
  average_rating?: number;
  overall_score?: number;
  reviewer?: string;
  ratings?: RatingRow[];
}

const sameRatings = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

export default function StaffReviewDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const { result: review, query } = useOne<MerakiReviewFull>({
    resource: "Meraki Review",
    id: name!,
    meta: { fields: ["*"] },
  });
  const { criteria, error: criteriaError, retry: retryCriteria } = useReviewCriteria();

  // What the server holds now; the edit state is diffed against this on save.
  const baseline = useMemo(() => {
    const ratings: Record<string, number> = {};
    for (const r of review?.ratings ?? []) ratings[r.criterion] = r.score;
    return {
      period: review?.period ?? "",
      notes: notesToPlain(review?.notes),
      overallScore: review?.overall_score && review.overall_score > 0 ? review.overall_score : undefined,
      ratings,
    };
  }, [review]);

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [overallScore, setOverallScore] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const busy = useRef(false);

  const payload = useMemo(() => {
    const body: Record<string, unknown> = {};
    if (period !== baseline.period) body.period = period || null;
    if (notes !== baseline.notes) body.notes = notes;
    if (overallScore !== baseline.overallScore) body.overall_score = overallScore && overallScore > 0 ? overallScore : null;
    if (!sameRatings(ratings, baseline.ratings)) body.ratings = Object.entries(ratings).map(([criterion, score]) => ({ criterion, score }));
    return body;
  }, [period, notes, overallScore, ratings, baseline]);
  const dirty = Object.keys(payload).length > 0;

  // Seed the form on first load, and re-seed when the server copy changes only if there are no
  // unsaved edits (a background refetch must not wipe what the user is typing).
  const syncKey = `${review?.name ?? ""}|${review?.modified ?? ""}`;
  const seeded = useRef(false);
  useEffect(() => {
    if (!review || (seeded.current && dirty)) return;
    seeded.current = true;
    setPeriod(baseline.period);
    setNotes(baseline.notes);
    setOverallScore(baseline.overallScore);
    setRatings(baseline.ratings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  useEffect(() => {
    if (query.isError) console.error("Review failed to load", name, query.error);
  }, [query.isError, query.error, name]);

  async function handleSave() {
    if (busy.current || !dirty) return;
    busy.current = true;
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      const res = await fetch(`/inquiry-api/reviews/${encodeURIComponent(name!)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }
      await query.refetch();
      invalidate({ resource: "Meraki Review", invalidates: ["list"] });
      setSaveSuccess(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Review save failed", name, err);
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (busy.current) return;
    busy.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/inquiry-api/reviews/${encodeURIComponent(name!)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }
      invalidate({ resource: "Meraki Review", invalidates: ["list"] });
      navigate("/hr/staff-reviews");
    } catch (err) {
      console.error("Review delete failed", name, err);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      busy.current = false;
      setDeleting(false);
    }
  }

  if (query.isLoading) return <DetailSkeleton />;
  if (query.isError) {
    return (
      <StatePanel
        kind="error"
        title="Couldn't load this review"
        text="The server didn't answer. Your data is safe."
        action={{ label: "Try again", onClick: () => void query.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
      />
    );
  }
  if (!review) return <StatePanel kind="empty" title="Review not found" text="It may have been deleted." action={{ label: "Back to reviews", onClick: () => navigate("/hr/staff-reviews") }} />;

  const score = reviewScore(review);
  const shown = score !== null ? Math.round(score) : null;
  const person = review.employee_name || review.employee;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Button variant="ghost" size="sm" className="-ml-2 self-start max-md:h-12" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      <Card className="rounded-card">
        <CardContent className="flex items-start justify-between gap-4 p-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">{person}</h1>
            <p className="text-sm text-muted-foreground">
              {[isoDate(review.review_date), review.period, review.reviewer && `Reviewed by ${review.reviewer}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          {shown !== null && (
            <div className="shrink-0 rounded-md px-3 py-2 text-2xl font-semibold tabular-nums text-primary-foreground" style={{ backgroundColor: rampColor(shown) }}>
              {shown}
              <span className="text-sm font-medium opacity-80"> / 10</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <RatingsCard
          criteria={criteria}
          criteriaError={criteriaError}
          onRetry={retryCriteria}
          ratings={ratings}
          disabled={saving}
          onChange={(c, n) => setRatings((prev) => ({ ...prev, [c]: n }))}
        />
        <DetailsCard
          period={period}
          onPeriod={setPeriod}
          notes={notes}
          onNotes={setNotes}
          overallScore={overallScore}
          onOverall={setOverallScore}
          saveError={saveError}
          saveSuccess={saveSuccess}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          className="border-destructive/30 text-destructive hover:bg-destructive/10 max-md:h-12"
          onClick={() => { setDeleteError(""); setDeleteOpen(true); }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete review
        </Button>
        <Button onClick={handleSave} disabled={saving || !dirty} className="max-md:h-12">
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete this review?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the review for <strong>{person}</strong> on {isoDate(review.review_date)}. This cannot be undone.
          </p>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
