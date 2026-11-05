import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVNDFull } from "@/lib/format";
import { Link } from "react-router";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";

/** Read-only row that is hidden when it has no value. */
function Field({ label, value }: { label: string; value: string }) {
  return value ? <ReadOnlyField label={label} value={value} /> : null;
}
import FileAttachments from "@/components/FileAttachments";
import { isoDate } from "../employee-detail/dates";
import { RatingStars } from "./RatingStars";
import type { Applicant, InterviewRow, OfferRow } from "./types";

export function ContactCard({ applicant }: { applicant: Applicant }) {
  return (
    <Card>
      <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ReadOnlyField label="Email" value={applicant.email_id ?? ""} />
        <Field label="Phone" value={applicant.phone_number ?? ""} />
      </CardContent>
    </Card>
  );
}

interface AppProps {
  applicant: Applicant;
  stars: number;
  onRate: (stars: number) => void;
  ratingBusy: boolean;
  ratingError: string | null;
  positionTitle: string;
}

export function ApplicationCard({ applicant, stars, onRate, ratingBusy, ratingError, positionTitle }: AppProps) {
  return (
    <Card>
      <CardHeader><CardTitle>Application</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {positionTitle && (
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-sm text-muted-foreground">Position</span>
            <Link to="/hr/recruiting/jobs" className="min-w-0 break-words text-right text-sm font-medium text-primary hover:underline">
              {positionTitle}
            </Link>
          </div>
        )}
        <Field label="Source" value={applicant.source ?? ""} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Rating</span>
          <RatingStars stars={stars} onChange={onRate} disabled={ratingBusy} />
        </div>
        {ratingError && <p role="alert" className="text-sm text-danger-soft-foreground">{ratingError}</p>}
        <ReadOnlyField label="Applied" value={isoDate(applicant.creation)} />
        <Field label="ERPNext Status" value={applicant.status ?? ""} />
        <ApplicationAnswers applicant={applicant} />
      </CardContent>
    </Card>
  );
}

/** What the candidate entered on the job-apply form (read-only). */
function ApplicationAnswers({ applicant: a }: { applicant: Applicant }) {
  const education = [a.custom_education_degree, a.custom_education_institution, a.custom_education_graduation_year]
    .filter(Boolean)
    .join(" · ");
  const hasAny = a.custom_city || a.custom_linkedin_url || a.lower_range || education || a.custom_work_experience;
  if (!hasAny) return null;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <Field label="City" value={a.custom_city ?? ""} />
      {a.custom_linkedin_url && (
        <div className="flex items-baseline justify-between gap-4">
          <span className="shrink-0 text-sm text-muted-foreground">LinkedIn</span>
          <a
            href={safeUrl(a.custom_linkedin_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 break-all text-right text-sm font-medium text-primary hover:underline"
          >
            {a.custom_linkedin_url}
          </a>
        </div>
      )}
      <Field label="Salary expectation" value={a.lower_range ? formatVNDFull(a.lower_range) : ""} />
      <Field label="Education" value={education} />
      {a.custom_work_experience && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Work experience</span>
          <p className="whitespace-pre-wrap text-sm">{a.custom_work_experience}</p>
        </div>
      )}
    </div>
  );
}

/** Only http(s) links are clickable; anything else (javascript:, data:) falls back to "#". */
function safeUrl(url: string): string {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  return /^[\w.-]+\.[a-z]{2,}/i.test(u) ? `https://${u}` : "#";
}

/** Resume download (legacy field), cover letter and uploaded attachments. */
export function DocumentCards({ applicant, name }: { applicant: Applicant; name: string }) {
  return (
    <>
      {applicant.resume_attachment && (
        <Card>
          <CardHeader><CardTitle>Resume</CardTitle></CardHeader>
          <CardContent>
            <a
              href={`/api/method/frappe.utils.file_manager.download_file?file_url=${encodeURIComponent(applicant.resume_attachment)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-primary hover:underline md:min-h-0"
            >
              <Download className="h-4 w-4" /> Download Resume
            </a>
          </CardContent>
        </Card>
      )}
      <FileAttachments doctype="Job Applicant" docname={name} />
      {applicant.cover_letter && (
        <Card>
          <CardHeader><CardTitle>Cover Letter</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{applicant.cover_letter}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}

function Row({ title, date, status }: { title: string; date?: string; status?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0 last:pb-0 first:pt-0">
      <div className="min-w-0 text-sm">
        <span className="font-medium">{title}</span>
        {date && <span className="ml-2 text-muted-foreground">{isoDate(date)}</span>}
      </div>
      {status && <Badge variant="secondary">{status}</Badge>}
    </div>
  );
}

export function InterviewsCard({ interviews, failed, loading }: { interviews: InterviewRow[]; failed?: boolean; loading?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Interviews</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <ListSkeleton />
        ) : failed ? (
          <p role="alert" className="text-sm text-danger-soft-foreground">Could not load interviews.</p>
        ) : interviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interviews yet.</p>
        ) : (
          interviews.map((iv) => <Row key={iv.name} title={iv.interview_round || iv.name} date={iv.scheduled_on} status={iv.status} />)
        )}
      </CardContent>
    </Card>
  );
}

export function OffersCard({ offers, failed, loading }: { offers: OfferRow[]; failed?: boolean; loading?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Job Offers</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <ListSkeleton />
        ) : failed ? (
          <p role="alert" className="text-sm text-danger-soft-foreground">Could not load offers.</p>
        ) : offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No offer yet.</p>
        ) : (
          offers.map((o) => <Row key={o.name} title={o.designation || o.name} date={o.offer_date} status={o.status} />)
        )}
      </CardContent>
    </Card>
  );
}
