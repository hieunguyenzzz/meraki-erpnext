import { useRef, useState } from "react";
import { useParams } from "react-router";
import { useCustomMutation, useInvalidate, useList, useOne } from "@refinedev/core";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Trash2 } from "lucide-react";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ApplicantHeader } from "./applicant-detail/ApplicantHeader";
import { CommentsCard } from "./applicant-detail/CommentsCard";
import { DeleteApplicantDialog } from "./applicant-detail/DeleteApplicantDialog";
import { ApplicationCard, ContactCard, DocumentCards, InterviewsCard, OffersCard } from "./applicant-detail/InfoCards";
import type { Applicant, InterviewRow, OfferRow } from "./applicant-detail/types";

const TABS = ["overview", "cv", "interviews", "comments"] as const;

export default function ApplicantDetailPage() {
  const { name } = useParams<{ name: string }>();
  const id = name!;
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("overview").withOptions({ clearOnDefault: true }));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const ratingLock = useRef(false);
  const { mutateAsync: customMutation } = useCustomMutation();
  const invalidate = useInvalidate();

  const { result, query } = useOne({
    resource: "Job Applicant",
    id,
    meta: {
      fields: [
        "name", "applicant_name", "email_id", "phone_number",
        "job_title", "source", "applicant_rating", "creation",
        "cover_letter", "resume_attachment", "custom_recruiting_stage",
        "status", "custom_city", "custom_linkedin_url", "lower_range",
        "custom_education_degree", "custom_education_institution",
        "custom_education_graduation_year", "custom_work_experience",
      ],
    },
  });
  const applicant = result as unknown as Applicant | undefined;

  // job_title is the Job Opening link name; resolve it to the readable title
  const { result: opening, query: openingQuery } = useOne({
    resource: "Job Opening",
    id: applicant?.job_title ?? "",
    queryOptions: { enabled: !!applicant?.job_title },
    meta: { fields: ["name", "job_title"] },
  });
  // Hidden while loading so the raw id never flashes; falls back to the id if the lookup fails
  const positionTitle = applicant?.job_title && !openingQuery.isLoading
    ? ((opening as unknown as { job_title?: string } | undefined)?.job_title || applicant.job_title)
    : "";

  const { result: interviewsResult, query: interviewsQuery } = useList({
    resource: "Interview",
    pagination: { mode: "off" },
    filters: [{ field: "job_applicant", operator: "eq", value: id }],
    meta: { fields: ["name", "interview_round", "scheduled_on", "status"] },
  });
  const interviews = (interviewsResult?.data ?? []) as unknown as InterviewRow[];

  const { result: offersResult, query: offersQuery } = useList({
    resource: "Job Offer",
    pagination: { mode: "off" },
    filters: [{ field: "job_applicant", operator: "eq", value: id }],
    meta: { fields: ["name", "designation", "offer_date", "status"] },
  });
  const offers = (offersResult?.data ?? []) as unknown as OfferRow[];

  const stars = Math.round((applicant?.applicant_rating ?? 0) * 5);

  async function handleRating(starIndex: number) {
    if (ratingLock.current) return;
    ratingLock.current = true;
    setRatingBusy(true);
    setRatingError(null);
    try {
      const newStars = starIndex === stars ? 0 : starIndex;
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype: "Job Applicant", name: id, fieldname: "applicant_rating", value: newStars / 5 },
      });
      invalidate({ resource: "Job Applicant", invalidates: ["detail"], id });
    } catch (err) {
      console.error("Applicant rating failed", id, err);
      setRatingError("Could not save the rating. Try again.");
    } finally {
      ratingLock.current = false;
      setRatingBusy(false);
    }
  }

  if (query.isError) {
    return <p role="alert" className="py-10 text-center text-sm text-danger-soft-foreground">Could not load this applicant.</p>;
  }
  if (!applicant) return <DetailSkeleton />;

  const application = <ApplicationCard applicant={applicant} stars={stars} onRate={handleRating} ratingBusy={ratingBusy} ratingError={ratingError} positionTitle={positionTitle} />;
  const documents = <DocumentCards applicant={applicant} name={id} />;

  return (
    <div className="space-y-5 pb-6">
      <ApplicantHeader
        applicant={applicant}
        stars={stars}
        positionTitle={positionTitle}
        isDesktop={isDesktop}
        onDelete={() => setDeleteOpen(true)}
        onMore={() => setMoreOpen(true)}
      />

      {isDesktop ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-4">
            {documents}
            <CommentsCard name={id} />
          </div>
          <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
            <ContactCard applicant={applicant} />
            {application}
            <InterviewsCard interviews={interviews} failed={interviewsQuery.isError} loading={interviewsQuery.isLoading} />
            <OffersCard offers={offers} failed={offersQuery.isError} loading={offersQuery.isLoading} />
          </div>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => void setTab(v as (typeof TABS)[number])}>
          <TabsList className="h-12 w-full gap-5 overflow-x-auto">
            <TabsTrigger value="overview" className="h-12 px-0">Overview</TabsTrigger>
            <TabsTrigger value="cv" className="h-12 px-0">CV</TabsTrigger>
            <TabsTrigger value="interviews" className="h-12 px-0">Interviews</TabsTrigger>
            <TabsTrigger value="comments" className="h-12 px-0">Comments</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-3">
            <ContactCard applicant={applicant} />
            {application}
          </TabsContent>
          <TabsContent value="cv" className="space-y-3">{documents}</TabsContent>
          <TabsContent value="interviews" className="space-y-3">
            <InterviewsCard interviews={interviews} failed={interviewsQuery.isError} loading={interviewsQuery.isLoading} />
            <OffersCard offers={offers} failed={offersQuery.isError} loading={offersQuery.isLoading} />
          </TabsContent>
          <TabsContent value="comments"><CommentsCard name={id} /></TabsContent>
        </Tabs>
      )}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
          <SheetHeader><SheetTitle>Actions</SheetTitle></SheetHeader>
          <Button
            variant="outline"
            className="mt-4 h-12 w-full justify-start border-destructive/30 text-destructive hover:bg-danger-soft"
            onClick={() => { setMoreOpen(false); setDeleteOpen(true); }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete applicant
          </Button>
        </SheetContent>
      </Sheet>
      <DeleteApplicantDialog id={id} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
