import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
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
        <ReadOnlyField label="Phone" value={applicant.phone_number ?? ""} />
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
}

export function ApplicationCard({ applicant, stars, onRate, ratingBusy, ratingError }: AppProps) {
  return (
    <Card>
      <CardHeader><CardTitle>Application</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ReadOnlyField label="Position" value={applicant.job_title ?? ""} />
        <ReadOnlyField label="Source" value={applicant.source ?? ""} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Rating</span>
          <RatingStars stars={stars} onChange={onRate} disabled={ratingBusy} />
        </div>
        {ratingError && <p role="alert" className="text-sm text-danger-soft-foreground">{ratingError}</p>}
        <ReadOnlyField label="Applied" value={isoDate(applicant.creation)} />
        <ReadOnlyField label="ERPNext Status" value={applicant.status ?? ""} />
      </CardContent>
    </Card>
  );
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

export function InterviewsCard({ interviews, failed }: { interviews: InterviewRow[]; failed?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Interviews</CardTitle></CardHeader>
      <CardContent>
        {failed ? (
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

export function OffersCard({ offers, failed }: { offers: OfferRow[]; failed?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Job Offers</CardTitle></CardHeader>
      <CardContent>
        {failed ? (
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
