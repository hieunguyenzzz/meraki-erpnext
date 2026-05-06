import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SegmentedRating } from "./SegmentedRating";
import { CreateReviewSheet } from "./CreateReviewSheet";
import { useInvalidate } from "@refinedev/core";
import { formatDate } from "@/lib/format";

interface ReviewTrend {
  date: string;
  score: number;
}

interface ReviewRecord {
  name: string;
  review_date: string;
  period?: string;
  average_rating?: number;
  overall_score?: number;
  reviewer?: string;
}

interface HistoryResponse {
  reviews: ReviewRecord[];
  average_trend: ReviewTrend[];
}

function Sparkline({ trend }: { trend: ReviewTrend[] }) {
  if (trend.length < 2) return null;
  const W = 120, H = 32, P = 2;
  const xs = trend.map((_, i) => P + (i * (W - 2 * P)) / (trend.length - 1));
  const ys = trend.map((t) => H - P - ((t.score - 1) / 9) * (H - 2 * P));
  const path = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} className="text-foreground/70">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export function EmployeeReviewsTab({ employeeName }: { employeeName: string }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setLoading(true);
    setFetchError("");
    fetch(`/inquiry-api/reviews/employee/${encodeURIComponent(employeeName)}/history`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setFetchError("Failed to load review history"))
      .finally(() => setLoading(false));
  }, [employeeName, version]);

  function handleCreated() {
    setSheetOpen(false);
    setVersion((v) => v + 1);
    invalidate({ resource: "Meraki Review", invalidates: ["list"] });
  }

  const reviews = data?.reviews ?? [];
  const trend = data?.average_trend ?? [];

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading reviews...</p>;
  }

  if (fetchError) {
    return <p className="text-sm text-destructive py-4">{fetchError}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {trend.length >= 2 && (
          <div className="flex items-center gap-2">
            <Sparkline trend={trend} />
            <span className="text-xs text-muted-foreground">
              avg trend ({trend.length} reviews)
            </span>
          </div>
        )}
        {trend.length < 2 && <div />}
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          Add Review
        </Button>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Reviewer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r) => {
              const override = r.overall_score;
                  const avg = r.average_rating;
                  const displayScore = (override && override > 0) ? override : (avg && avg > 0) ? avg : null;
              return (
                <TableRow
                  key={r.name}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/hr/staff-reviews/${encodeURIComponent(r.name)}`)}
                >
                  <TableCell>{formatDate(r.review_date)}</TableCell>
                  <TableCell>{r.period || "—"}</TableCell>
                  <TableCell>
                    <div className="w-32">
                      <SegmentedRating
                        value={displayScore !== null ? Math.round(displayScore) : null}
                        readOnly
                        size="sm"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reviewer || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <CreateReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={handleCreated}
        presetEmployee={employeeName}
      />
    </div>
  );
}
