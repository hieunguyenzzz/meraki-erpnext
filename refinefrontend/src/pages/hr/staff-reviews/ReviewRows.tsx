import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { SegmentedRating } from "@/components/staff-review/SegmentedRating";
import { type MerakiReview, formatScore, isoDate, reviewScore } from "./reviewUtils";

const href = (r: MerakiReview) => `/hr/staff-reviews/${encodeURIComponent(r.name)}`;
const who = (r: MerakiReview) => r.employee_name || r.employee;

function Score({ review }: { review: MerakiReview }) {
  const score = reviewScore(review);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28"><SegmentedRating value={score === null ? null : Math.round(score)} readOnly size="sm" hideValue ariaLabel={`Score for ${who(review)}`} /></div>
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatScore(score)}</span>
    </div>
  );
}

export function ReviewTableRow({ review }: { review: MerakiReview }) {
  return (
    <tr className="border-t">
      <td className="px-4 py-3">
        <Link to={href(review)} className="font-medium text-primary hover:underline focus-visible:underline">{who(review)}</Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{isoDate(review.review_date)}</td>
      <td className="whitespace-nowrap px-4 py-3">{review.period || "-"}</td>
      <td className="px-4 py-3"><Score review={review} /></td>
      <td className="px-4 py-3 text-muted-foreground">{review.reviewer || "-"}</td>
      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{isoDate(review.creation)}</td>
    </tr>
  );
}

export function ReviewCard({ review }: { review: MerakiReview }) {
  return (
    <Link to={href(review)} className="flex min-h-12 flex-col gap-2 rounded-card border bg-card p-4 active:bg-muted">
      <div className="flex items-center justify-between gap-2">
        <b className="truncate">{who(review)}</b>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <Score review={review} />
      <p className="text-sm text-muted-foreground">
        {[review.period, isoDate(review.review_date), review.reviewer && `by ${review.reviewer}`].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}
