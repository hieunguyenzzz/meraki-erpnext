import { useState } from "react";
import { useParams, Link } from "react-router";
import { useOne, useList, useDelete, useNavigation } from "@refinedev/core";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Download, Star, ArrowLeft } from "lucide-react";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";

function stageBadgeVariant(stage: string) {
  switch (stage) {
    case "Applied": return "info" as const;
    case "Screening": return "warning" as const;
    case "Interview": return "default" as const;
    case "Offer": return "info" as const;
    case "Hired": return "success" as const;
    case "Rejected": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function ApplicantDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { mutateAsync: deleteRecord } = useDelete();
  const { list } = useNavigation();

  const { result: applicant } = useOne({
    resource: "Job Applicant",
    id: name!,
    meta: {
      fields: [
        "name", "applicant_name", "email_id", "phone_number",
        "job_title", "source", "applicant_rating", "creation",
        "cover_letter", "resume_attachment", "custom_recruiting_stage",
        "status",
      ],
    },
  });

  // Linked Interviews
  const { result: interviewsResult } = useList({
    resource: "Interview",
    pagination: { mode: "off" },
    filters: [{ field: "job_applicant", operator: "eq", value: name! }],
    meta: { fields: ["name", "interview_round", "scheduled_date", "status"] },
  });
  const interviews = interviewsResult?.data ?? [];

  // Linked Job Offers
  const { result: offersResult } = useList({
    resource: "Job Offer",
    pagination: { mode: "off" },
    filters: [{ field: "job_applicant", operator: "eq", value: name! }],
    meta: { fields: ["name", "designation", "offer_date", "status"] },
  });
  const offers = offersResult?.data ?? [];

  async function handleDelete() {
    await deleteRecord({ resource: "Job Applicant", id: name! });
    list("Job Applicant");
  }

  if (!applicant) return <DetailSkeleton />;

  const stage = applicant.custom_recruiting_stage || "Applied";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/hr/recruiting" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {applicant.applicant_name || applicant.name}
          </h1>
          <Badge variant={stageBadgeVariant(stage)}>{stage}</Badge>
        </div>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Applicant</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this applicant? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Contact */}
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Email" value={applicant.email_id ?? ""} />
            <ReadOnlyField label="Phone" value={applicant.phone_number ?? ""} />
          </CardContent>
        </Card>

        {/* Application */}
        <Card>
          <CardHeader><CardTitle>Application</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Position" value={applicant.job_title ?? ""} />
            <ReadOnlyField label="Source" value={applicant.source ?? ""} />
            {applicant.applicant_rating > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground mr-2">Rating</span>
                <span className="flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: Math.min(Math.round((applicant.applicant_rating ?? 0) * 5), 5) }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </span>
              </div>
            )}
            <ReadOnlyField label="Applied" value={formatDate(applicant.creation)} />
            <ReadOnlyField label="ERPNext Status" value={applicant.status ?? ""} />
          </CardContent>
        </Card>
      </div>

      {/* Resume */}
      {applicant.resume_attachment && (
        <Card>
          <CardHeader><CardTitle>Resume</CardTitle></CardHeader>
          <CardContent>
            <a
              href={applicant.resume_attachment}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Download className="h-4 w-4" /> Download Resume
            </a>
          </CardContent>
        </Card>
      )}

      {/* Cover Letter */}
      {applicant.cover_letter && (
        <Card>
          <CardHeader><CardTitle>Cover Letter</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{applicant.cover_letter}</p>
          </CardContent>
        </Card>
      )}

      {/* Interviews */}
      {interviews.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Interviews</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {interviews.map((iv: any) => (
                <div key={iv.name} className="flex items-center justify-between border-b py-2 last:border-0">
                  <div>
                    <span className="text-sm font-medium">{iv.interview_round || iv.name}</span>
                    {iv.scheduled_date && (
                      <span className="text-xs text-muted-foreground ml-2">{formatDate(iv.scheduled_date)}</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">{iv.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Offers */}
      {offers.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Job Offers</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {offers.map((o: any) => (
                <div key={o.name} className="flex items-center justify-between border-b py-2 last:border-0">
                  <div>
                    <span className="text-sm font-medium">{o.designation || o.name}</span>
                    {o.offer_date && (
                      <span className="text-xs text-muted-foreground ml-2">{formatDate(o.offer_date)}</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">{o.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
