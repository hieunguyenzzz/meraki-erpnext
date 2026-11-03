import { ArrowLeft, MoreVertical, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { isoDate } from "../employee-detail/dates";
import { stageBadgeVariant, type Applicant } from "./types";

interface Props {
  applicant: Applicant;
  stars: number;
  isDesktop: boolean;
  onDelete: () => void;
  onMore: () => void;
}

export function ApplicantHeader({ applicant, stars, isDesktop, onDelete, onMore }: Props) {
  const name = applicant.applicant_name || applicant.name;
  const stage = applicant.custom_recruiting_stage || "Applied";
  const sub = [applicant.job_title, `applied ${isoDate(applicant.creation)}`].filter(Boolean).join(" · ");

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link to="/hr/recruiting" aria-label="Back to recruiting" className="-ml-2 flex h-12 w-12 items-center justify-center rounded-full hover:bg-muted md:h-10 md:w-10">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {!isDesktop && (
          <Button variant="ghost" size="icon" aria-label="More actions" className="h-12 w-12" onClick={onMore}>
            <MoreVertical className="h-5 w-5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <StaffAvatar name={name} id={applicant.name} className="h-14 w-14 text-lg md:h-16 md:w-16 md:text-xl" />
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
          <h1 className="break-words font-display text-[28px] font-semibold leading-8 md:text-[36px] md:leading-10">{name}</h1>
          <p className="text-sm text-muted-foreground">{sub}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stageBadgeVariant(stage)}>{stage}</Badge>
            <span className="text-sm text-muted-foreground" aria-label={`Rating ${stars} of 5`}>
              {stars > 0 ? `${"★".repeat(stars)}${"☆".repeat(5 - stars)} ${stars} / 5` : "Not rated"}
            </span>
          </div>
        </div>
        {isDesktop && (
          <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-danger-soft" onClick={onDelete}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        )}
      </div>
    </header>
  );
}
