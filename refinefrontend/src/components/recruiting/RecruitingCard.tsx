import { Link } from "react-router";
import { Gift, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecruitingItem } from "@/lib/recruiting-kanban";
import { RatingStars } from "./RatingStars";

const CARD =
  "flex min-h-12 w-full shrink-0 flex-col gap-1.5 rounded-card border bg-card p-3.5 text-left text-card-foreground shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-xl md:border-transparent md:px-3.5 md:py-3";

function CardBody({ item }: { item: RecruitingItem }) {
  const facts = [
    `Applied ${item.creation.slice(0, 10)}`,
    item.resumeAttachment ? "CV ✓" : null,
    item.coverLetter ? "letter ✓" : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <span className="min-w-0 break-words text-base font-semibold md:text-[15px]">{item.applicantName}</span>
      {item.jobTitle && <span className="break-words text-[13px] text-muted-foreground">{item.jobTitle}</span>}
      <span className="text-[13px] text-muted-foreground">{facts}</span>
      <RatingStars value={item.rating} />
      {(item.source || item.hasInterview || item.hasOffer) && (
        <span className="flex flex-wrap items-center gap-1.5">
          {item.source && <Badge variant="secondary" className="px-2 py-0 text-[11px]">{item.source}</Badge>}
          {item.hasInterview && (
            <Badge variant="info" className="px-2 py-0 text-[11px]"><MessageSquare className="h-3 w-3" aria-hidden />Interview</Badge>
          )}
          {item.hasOffer && (
            <Badge variant="success" className="px-2 py-0 text-[11px]"><Gift className="h-3 w-3" aria-hidden />Offer</Badge>
          )}
        </span>
      )}
    </>
  );
}

/** One applicant on the board or in the phone list. Screening cards open the CV review sheet; the rest open the applicant. */
export function RecruitingCard({ item, onOpenSheet }: { item: RecruitingItem; onOpenSheet?: (id: string) => void }) {
  if (onOpenSheet) {
    return (
      <button type="button" className={CARD} onClick={() => onOpenSheet(item.id)}>
        <CardBody item={item} />
      </button>
    );
  }
  return (
    <Link to={`/hr/recruiting/${item.id}`} className={CARD}>
      <CardBody item={item} />
    </Link>
  );
}
