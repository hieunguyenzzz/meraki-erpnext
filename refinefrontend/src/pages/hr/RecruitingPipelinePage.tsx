import { useEffect, useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { RotateCw } from "lucide-react";
import { RecruitingHeader } from "@/components/recruiting/RecruitingHeader";
import { CVReviewSheet } from "@/components/recruiting/CVReviewSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { StatePanel } from "@/components/StatePanel";
import { buildRecruitingItems, enrichRecruitingItems } from "@/lib/recruiting-kanban";
import { PipelineBoard, STAGE_VALUES } from "./recruiting-pipeline/PipelineBoard";

// Drag and drop disabled - status changes via admin panel only

const PIPELINE_STAGES = ["Screening", "Interview", "Offer", "Hired", "Rejected"];
const ALL_POSITIONS = "__all__"; // Radix Select cannot hold an empty value

function BoardSkeleton() {
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    <div aria-busy="true" aria-label="Loading applicants">
      {desktop ? (
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[248px] shrink-0 space-y-2.5 rounded-card bg-secondary p-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-full" />)}
          </div>
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      )}
    </div>
  );
}

export default function RecruitingPipelinePage() {
  // Kept in the URL so Back from an applicant returns to the same position and stage.
  const [jobParam, setJobParam] = useQueryState("job", { defaultValue: "", clearOnDefault: true });
  const [stage, setStage] = useQueryState("stage", parseAsStringLiteral(STAGE_VALUES).withDefault("Screening").withOptions({ clearOnDefault: true }));
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);

  // Job Openings for filter
  const { result: jobOpeningsResult, query: jobsQuery } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
  });
  const jobOpenings = useMemo(() => (jobOpeningsResult?.data ?? []) as { name: string; job_title: string }[], [jobOpeningsResult]);

  const jobTitles = useMemo(() => new Map(jobOpenings.map((jo) => [jo.name, jo.job_title])), [jobOpenings]);

  // A position in the URL that matches no opening is ignored
  const jobFilter = jobParam && jobOpenings.some((jo) => jo.name === jobParam) ? jobParam : "";

  // Applicants in pipeline stages
  const { result: applicantsResult, query: applicantsQuery } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    filters: [{ field: "custom_recruiting_stage", operator: "in", value: PIPELINE_STAGES }],
    meta: {
      fields: [
        "name", "applicant_name", "email_id", "phone_number",
        "job_title", "source", "applicant_rating", "creation",
        "cover_letter", "resume_attachment", "custom_recruiting_stage",
      ],
    },
  });

  // Interviews / Job Offers for enrichment
  const { result: interviewsResult, query: interviewsQuery } = useList({
    resource: "Interview",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_applicant"] },
  });
  const { result: offersResult, query: offersQuery } = useList({
    resource: "Job Offer",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_applicant"] },
  });

  useEffect(() => {
    if (applicantsQuery.isError) console.error("Recruiting pipeline: applicants failed", applicantsQuery.error);
    if (jobsQuery.isError) console.error("Recruiting pipeline: job openings failed", jobsQuery.error);
    if (interviewsQuery.isError) console.error("Recruiting pipeline: interviews failed", interviewsQuery.error);
    if (offersQuery.isError) console.error("Recruiting pipeline: job offers failed", offersQuery.error);
  }, [applicantsQuery.isError, applicantsQuery.error, jobsQuery.isError, jobsQuery.error, interviewsQuery.isError, interviewsQuery.error, offersQuery.isError, offersQuery.error]);

  const items = useMemo(() => {
    const raw = ((applicantsResult?.data ?? []) as { job_title?: string }[])
      .filter((a) => !jobFilter || a.job_title === jobFilter)
      // job_title is the Job Opening link name; show its readable title
      .map((a) => ({ ...a, job_title: jobTitles.get(a.job_title ?? "") || a.job_title }));
    const base = buildRecruitingItems(raw);
    return enrichRecruitingItems(base, interviewsResult?.data ?? [], offersResult?.data ?? []);
  }, [applicantsResult, interviewsResult, offersResult, jobFilter, jobTitles]);

  const screeningItems = useMemo(() => items.filter((i) => i.stage === "Screening"), [items]);

  const isLoading = applicantsQuery.isLoading;

  return (
    <div className="flex flex-col gap-4">
      <RecruitingHeader />

      <Select value={jobFilter || ALL_POSITIONS} onValueChange={(v) => void setJobParam(v === ALL_POSITIONS ? "" : v)}>
        <SelectTrigger aria-label="Position" className="w-full gap-2 rounded-full md:w-[240px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_POSITIONS}>All positions</SelectItem>
          {jobOpenings.map((jo) => <SelectItem key={jo.name} value={jo.name}>{jo.job_title}</SelectItem>)}
        </SelectContent>
      </Select>

      {(interviewsQuery.isError || offersQuery.isError) && !applicantsQuery.isError && (
        <p role="status" className="px-1 text-sm text-muted-foreground">
          Couldn't load {[interviewsQuery.isError && "interviews", offersQuery.isError && "offers"].filter(Boolean).join(" or ")}, so those badges are hidden.
        </p>
      )}

      {applicantsQuery.isError ? (
        <StatePanel
          kind="error"
          title="Couldn't load applicants"
          text="The server didn't answer. Your data is safe."
          action={{ label: "Try again", onClick: () => void applicantsQuery.refetch(), icon: <RotateCw className="h-4 w-4" /> }}
        />
      ) : isLoading ? (
        <BoardSkeleton />
      ) : (
        <PipelineBoard items={items} stage={stage} onStageChange={(s) => void setStage(s)} onOpenSheet={setSelectedApplicantId} />
      )}

      <CVReviewSheet
        applicantId={selectedApplicantId}
        screeningItems={screeningItems}
        onClose={() => setSelectedApplicantId(null)}
        onNavigate={setSelectedApplicantId}
      />
    </div>
  );
}
