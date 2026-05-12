import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { useOne, useInvalidate } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { SegmentedRating, rampColor } from "@/components/staff-review/SegmentedRating";
import { ArrowLeft, Trash2, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/format";

interface Criterion {
  name: string;
  criterion_name: string;
  sort_order: number;
}

interface RatingRow {
  criterion: string;
  score: number;
}

interface MerakiReview {
  name: string;
  employee: string;
  employee_name?: string;
  review_date: string;
  period?: string;
  notes?: string;
  average_rating?: number;
  overall_score?: number;
  reviewer?: string;
  ratings?: RatingRow[];
}

export default function StaffReviewDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const { result: review, query } = useOne<MerakiReview>({
    resource: "Meraki Review",
    id: name!,
    meta: { fields: ["*"] },
  });

  const [criteria, setCriteria] = useState<Criterion[]>([]);
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

  // Populate local state from fetched review
  useEffect(() => {
    if (!review) return;
    setPeriod(review.period ?? "");
    // Strip basic HTML tags for textarea display
    const rawNotes = review.notes ?? "";
    const plainNotes = rawNotes.replace(/<[^>]+>/g, "");
    setNotes(plainNotes);
    setOverallScore(review.overall_score && review.overall_score > 0 ? review.overall_score : undefined);
    const ratingMap: Record<string, number> = {};
    for (const r of review.ratings ?? []) {
      ratingMap[r.criterion] = r.score;
    }
    setRatings(ratingMap);
  }, [review]);

  // Fetch criteria
  useEffect(() => {
    fetch("/inquiry-api/reviews/criteria", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCriteria(d.criteria ?? []))
      .catch(() => setCriteria([]));
  }, []);

  const computedAverage = useMemo(() => {
    const values = Object.values(ratings);
    if (values.length === 0) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }, [ratings]);

  const override = review?.overall_score;
  const avg = review?.average_rating;
  const displayScore = (override && override > 0) ? override : (avg && avg > 0) ? avg : null;
  const scoreForDisplay = displayScore !== null ? Math.round(displayScore) : null;

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      const body = {
        period: period || null,
        notes,
        overall_score: overallScore && overallScore > 0 ? overallScore : null,
        ratings: Object.entries(ratings).map(([criterion, score]) => ({ criterion, score })),
      };
      const res = await fetch(`/inquiry-api/reviews/${encodeURIComponent(name!)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }
      query.refetch();
      invalidate({ resource: "Meraki Review", invalidates: ["list"] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/inquiry-api/reviews/${encodeURIComponent(name!)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }
      invalidate({ resource: "Meraki Review", invalidates: ["list"] });
      navigate("/hr/staff-reviews");
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  if (query.isLoading) return <DetailSkeleton />;
  if (!review) return <p className="text-sm text-muted-foreground">Review not found.</p>;

  const bgColor = scoreForDisplay ? rampColor(scoreForDisplay) : undefined;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      {/* Header card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-xl">
              {review.employee_name || review.employee}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {formatDate(review.review_date)}
              {review.period && ` · ${review.period}`}
              {review.reviewer && ` · Reviewed by ${review.reviewer}`}
            </p>
          </div>
          {scoreForDisplay !== null && (
            <div
              className="rounded-md px-3 py-2 text-white text-2xl font-semibold tabular-nums shrink-0"
              style={{ backgroundColor: bgColor }}
            >
              {scoreForDisplay}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Edit form */}
      <div className="space-y-6">
        {/* Criteria ratings */}
        {criteria.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Ratings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {criteria.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-3">
                  <span className="font-medium text-sm shrink-0 w-40">{c.criterion_name}</span>
                  <SegmentedRating
                    value={ratings[c.criterion_name] ?? null}
                    onChange={(n) => setRatings((prev) => ({ ...prev, [c.criterion_name]: n }))}
                    className="flex-1"
                  />
                </div>
              ))}
              {computedAverage !== null && (
                <p className="text-sm text-muted-foreground pt-1">
                  Computed average: <span className="font-medium">{computedAverage.toFixed(1)}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Period, notes, override */}
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Input
                placeholder="e.g. Q2 2026"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations, highlights, areas for improvement..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Overall Score Override</Label>
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
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            {saveSuccess && (
              <p className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Saved successfully
              </p>
            )}
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { setDeleteError(""); setDeleteOpen(true); }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Review
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this review?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the review for{" "}
            <strong>{review.employee_name || review.employee}</strong> on{" "}
            {formatDate(review.review_date)}. This cannot be undone.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
