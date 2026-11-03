import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedRating } from "@/components/staff-review/SegmentedRating";
import type { Criterion } from "./useReviewCriteria";

interface RatingsProps {
  criteria: Criterion[];
  criteriaError: boolean;
  onRetry: () => void;
  ratings: Record<string, number>;
  onChange: (criterion: string, n: number) => void;
}

export function RatingsCard({ criteria, criteriaError, onRetry, ratings, onChange }: RatingsProps) {
  const active = new Set(criteria.map((c) => c.criterion_name));
  // Ratings on criteria that are no longer active still ride along in the save, so show them.
  const retired = Object.keys(ratings).filter((k) => !active.has(k));
  const values = Object.values(ratings);
  const average = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

  return (
    <Card className="rounded-card">
      <CardHeader><CardTitle>Ratings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {criteriaError && (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load the rating criteria.{" "}
            <button type="button" className="font-semibold underline" onClick={onRetry}>Try again</button>
          </p>
        )}
        {criteria.map((c) => (
          <div key={c.name} className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
            <span className="text-sm font-medium md:w-40 md:shrink-0">{c.criterion_name}</span>
            <SegmentedRating
              value={ratings[c.criterion_name] ?? null}
              onChange={(n) => onChange(c.criterion_name, n)}
              className="flex-1"
            />
          </div>
        ))}
        {retired.map((k) => (
          <div key={k} className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
            <span className="text-sm font-medium text-muted-foreground md:w-40 md:shrink-0">{k} (inactive)</span>
            <SegmentedRating value={ratings[k]} readOnly className="flex-1" />
          </div>
        ))}
        {average !== null && (
          <p className="pt-1 text-sm text-muted-foreground">
            Computed average: <span className="font-medium text-foreground">{average.toFixed(1)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface DetailsProps {
  period: string;
  onPeriod: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
  overallScore: number | undefined;
  onOverall: (v: number | undefined) => void;
  saveError: string;
  saveSuccess: boolean;
}

export function DetailsCard(p: DetailsProps) {
  return (
    <Card className="rounded-card">
      <CardHeader><CardTitle>Details</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="review-period">Period</Label>
          <Input id="review-period" className="max-md:h-12" placeholder="e.g. Q2 2026" value={p.period} onChange={(e) => p.onPeriod(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="review-notes">Notes</Label>
          <Textarea
            id="review-notes"
            rows={6}
            value={p.notes}
            onChange={(e) => p.onNotes(e.target.value)}
            placeholder="Observations, highlights, areas for improvement..."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Overall score override</Label>
          <div className="flex items-center gap-3">
            <SegmentedRating value={p.overallScore ?? null} onChange={p.onOverall} size="sm" className="flex-1" />
            {p.overallScore !== undefined && (
              <Button type="button" variant="ghost" size="sm" onClick={() => p.onOverall(undefined)}>Clear</Button>
            )}
          </div>
        </div>
        {p.saveError && <p role="alert" className="text-sm text-destructive">{p.saveError}</p>}
        {p.saveSuccess && (
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Saved successfully
          </p>
        )}
      </CardContent>
    </Card>
  );
}
