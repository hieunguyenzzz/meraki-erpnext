import { useMemo, useCallback, useState } from "react";
import { Link } from "react-router";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { RecruitingCard } from "@/components/recruiting/RecruitingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { extractErrorMessage } from "@/lib/errors";
import {
  PIPELINE_COLUMNS,
  buildRecruitingItems,
  enrichRecruitingItems,
  getPipelineColumn,
  getPipelineTargetStatus,
} from "@/lib/recruiting-kanban";

const PIPELINE_STAGES = ["Screening", "Interview", "Offer", "Hired", "Rejected"];

export default function RecruitingPipelinePage() {
  const [jobFilter, setJobFilter] = useState("");
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // Job Openings for filter
  const { result: jobOpeningsResult } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
  });
  const jobOpenings = jobOpeningsResult?.data ?? [];

  // Applicants in pipeline stages
  const applicantFilters: any[] = [
    { field: "custom_recruiting_stage", operator: "in", value: PIPELINE_STAGES },
  ];
  if (jobFilter) {
    applicantFilters.push({ field: "job_title", operator: "contains", value: jobFilter });
  }

  const { result: applicantsResult, query: applicantsQuery } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    filters: applicantFilters,
    meta: {
      fields: [
        "name", "applicant_name", "email_id", "phone_number",
        "job_title", "source", "applicant_rating", "creation",
        "cover_letter", "resume_attachment", "custom_recruiting_stage",
      ],
    },
  });

  // Interviews for enrichment
  const { result: interviewsResult } = useList({
    resource: "Interview",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_applicant"] },
  });

  // Job Offers for enrichment
  const { result: offersResult } = useList({
    resource: "Job Offer",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_applicant"] },
  });

  const items = useMemo(() => {
    const base = buildRecruitingItems(applicantsResult?.data ?? []);
    return enrichRecruitingItems(base, interviewsResult?.data ?? [], offersResult?.data ?? []);
  }, [applicantsResult, interviewsResult, offersResult]);

  const isLoading = applicantsQuery?.isLoading;

  const handleUpdateStatus = useCallback(
    async (item: any, newStatus: string) => {
      try {
        await customMutation({
          url: "/api/method/frappe.client.set_value",
          method: "post",
          values: {
            doctype: "Job Applicant",
            name: item.id,
            fieldname: "custom_recruiting_stage",
            value: newStatus,
          },
        });
        invalidate({ resource: "Job Applicant", invalidates: ["list"] });
      } catch (err) {
        throw new Error(
          extractErrorMessage(err, `Failed to update applicant stage`)
        );
      }
    },
    [customMutation, invalidate]
  );

  const renderCard = useCallback(
    (item: any, isDragOverlay?: boolean) => (
      <RecruitingCard key={item.id} item={item} isDragOverlay={isDragOverlay} />
    ),
    []
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Recruiting Pipeline</h1>
        <div className="flex items-center gap-3">
          {/* Job filter */}
          <div className="relative">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
            >
              <option value="">All Positions</option>
              {jobOpenings.map((jo: any) => (
                <option key={jo.name} value={jo.job_title}>{jo.job_title}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          <Link
            to="/hr/recruiting"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> CV Inbox
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border-2 border-muted p-3 space-y-3 min-h-[300px]">
              <Skeleton className="h-5 w-[80px]" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            <KanbanBoard
              items={items}
              columns={[...PIPELINE_COLUMNS]}
              getColumnForItem={getPipelineColumn}
              getTargetStatus={(colKey) => getPipelineTargetStatus(colKey)}
              renderCard={renderCard}
              onUpdateStatus={handleUpdateStatus}
            />
          </div>
        </div>
      )}
    </div>
  );
}
