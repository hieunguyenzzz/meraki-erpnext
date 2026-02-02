import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, Star, Download, ArrowRight, ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/format";
import { formatAge } from "@/lib/kanban";
import { extractErrorMessage } from "@/lib/errors";

export default function RecruitingScannerPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [acting, setActing] = useState(false);
  const [expandCover, setExpandCover] = useState(false);
  const [jobFilter, setJobFilter] = useState("");

  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // Fetch Job Openings for filter dropdown
  const { result: jobOpeningsResult } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
  });
  const jobOpenings = jobOpeningsResult?.data ?? [];

  // Fetch applicants in "Applied" stage
  const filters: any[] = [
    { field: "custom_recruiting_stage", operator: "eq", value: "Applied" },
  ];
  if (jobFilter) {
    filters.push({ field: "job_title", operator: "contains", value: jobFilter });
  }

  const { result: applicantsResult, query: applicantsQuery } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    filters,
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name", "applicant_name", "email_id", "phone_number",
        "job_title", "source", "applicant_rating", "creation",
        "cover_letter", "resume_attachment", "custom_recruiting_stage",
      ],
    },
  });

  const applicants = useMemo(() => applicantsResult?.data ?? [], [applicantsResult]);
  const isLoading = applicantsQuery?.isLoading;

  // Reset index when filter changes or data refreshes
  useEffect(() => {
    setCurrentIndex(0);
    setExpandCover(false);
  }, [jobFilter]);

  const current = applicants[currentIndex] as any | undefined;

  const advance = useCallback(() => {
    setExpandCover(false);
    setCurrentIndex((prev) => prev + 1);
  }, []);

  async function handleAction(stage: "Screening" | "Rejected") {
    if (!current || acting) return;
    setActing(true);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: {
          doctype: "Job Applicant",
          name: current.name,
          fieldname: "custom_recruiting_stage",
          value: stage,
        },
      });
      invalidate({ resource: "Job Applicant", invalidates: ["list"] });
      advance();
    } catch (err) {
      alert(extractErrorMessage(err, `Failed to update applicant stage`));
    } finally {
      setActing(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (acting || !current) return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        handleAction("Screening");
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        handleAction("Rejected");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [acting, current]);

  // Swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStart === null || acting || !current) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    setTouchStart(null);
    if (diff > 80) handleAction("Screening");
    else if (diff < -80) handleAction("Rejected");
  }

  const queueDone = !isLoading && (!applicants.length || currentIndex >= applicants.length);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Recruiting</h1>
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
            to="/hr/recruiting/pipeline"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Pipeline <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-full max-w-lg space-y-4">
            <Skeleton className="h-8 w-[200px]" />
            <Skeleton className="h-64 w-full" />
            <div className="flex gap-4 justify-center">
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-12 w-32" />
            </div>
          </div>
        </div>
      )}

      {queueDone && (
        <div className="text-center py-16 space-y-4">
          <p className="text-lg text-muted-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground">No more applications to review.</p>
          <Link to="/hr/recruiting/pipeline">
            <Button variant="outline">
              Go to Pipeline <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {!isLoading && current && (
        <>
          {/* Counter */}
          <p className="text-center text-sm text-muted-foreground">
            {currentIndex + 1} of {applicants.length} applications
          </p>

          {/* Applicant Card */}
          <div
            className="flex justify-center"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <Card className="w-full max-w-lg">
              <CardContent className="p-6 space-y-4">
                {/* Name */}
                <div>
                  <Link
                    to={`/hr/recruiting/${current.name}`}
                    className="text-xl font-bold text-primary hover:underline"
                  >
                    {current.applicant_name || current.name}
                  </Link>
                </div>

                {/* Job title */}
                {current.job_title && (
                  <p className="text-sm text-muted-foreground">{current.job_title}</p>
                )}

                {/* Contact */}
                <div className="space-y-1 text-sm">
                  {current.email_id && <div>{current.email_id}</div>}
                  {current.phone_number && <div>{current.phone_number}</div>}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-3 flex-wrap">
                  {current.source && (
                    <Badge variant="secondary">{current.source}</Badge>
                  )}
                  {current.applicant_rating > 0 && (
                    <span className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: Math.min(Math.round(current.applicant_rating * 5), 5) }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-current" />
                      ))}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(current.creation)} ({formatAge(current.creation)})
                  </span>
                </div>

                {/* Cover letter */}
                {current.cover_letter && (
                  <div>
                    <p className={`text-sm whitespace-pre-wrap ${!expandCover ? "line-clamp-4" : ""}`}>
                      {current.cover_letter}
                    </p>
                    {current.cover_letter.length > 200 && (
                      <button
                        className="text-xs text-primary hover:underline mt-1"
                        onClick={() => setExpandCover(!expandCover)}
                      >
                        {expandCover ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}

                {/* Resume */}
                {current.resume_attachment && (
                  <a
                    href={current.resume_attachment}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Download className="h-4 w-4" /> Download Resume
                  </a>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Action buttons */}
          <div className="flex justify-center gap-4">
            <Button
              variant="destructive"
              size="lg"
              className="h-12 px-8"
              disabled={acting}
              onClick={() => handleAction("Rejected")}
            >
              <X className="h-5 w-5 mr-1" /> Reject
            </Button>
            <Button
              size="lg"
              className="h-12 px-8 bg-green-600 hover:bg-green-700 text-white"
              disabled={acting}
              onClick={() => handleAction("Screening")}
            >
              <Check className="h-5 w-5 mr-1" /> Accept
            </Button>
          </div>

          {/* Keyboard hint */}
          <p className="text-center text-xs text-muted-foreground">
            Keyboard: <kbd className="px-1 py-0.5 rounded border text-[10px]">←</kbd> Reject &middot; <kbd className="px-1 py-0.5 rounded border text-[10px]">→</kbd> Accept
          </p>
        </>
      )}
    </div>
  );
}
