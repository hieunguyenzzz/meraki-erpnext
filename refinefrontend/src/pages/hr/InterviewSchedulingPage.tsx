import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useList, useCreate, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ArrowRight, CalendarDays, AlertTriangle } from "lucide-react";
import { extractErrorMessage } from "@/lib/errors";
import {
  TIME_SLOTS,
  DEFAULT_DURATION_MINUTES,
  getEndTime,
  formatTimeShort,
  detectConflicts,
  interviewStatusVariant,
  type InterviewWithInterviewer,
} from "@/lib/interview-scheduling";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function InterviewSchedulingPage() {
  const [searchParams] = useSearchParams();
  const invalidate = useInvalidate();
  const { mutateAsync: createDoc } = useCreate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // State
  const [selectedDate, setSelectedDate] = useState(today());
  const [formCandidate, setFormCandidate] = useState(searchParams.get("candidate") ?? "");
  const [formDate, setFormDate] = useState(today());
  const [formFromTime, setFormFromTime] = useState("09:00");
  const [formToTime, setFormToTime] = useState(
    getEndTime("09:00", DEFAULT_DURATION_MINUTES),
  );
  const [formInterviewer, setFormInterviewer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Pre-fill candidate from URL
  useEffect(() => {
    const c = searchParams.get("candidate");
    if (c) setFormCandidate(c);
  }, [searchParams]);

  // Auto-calculate end time when start changes
  useEffect(() => {
    setFormToTime(getEndTime(formFromTime, DEFAULT_DURATION_MINUTES));
  }, [formFromTime]);

  // --- Data fetching ---

  // Candidates in Interview stage
  const { result: candidatesResult } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    filters: [
      { field: "custom_recruiting_stage", operator: "eq", value: "Interview" },
    ],
    meta: {
      fields: ["name", "applicant_name", "email_id", "job_title"],
    },
  });
  const candidates = candidatesResult?.data ?? [];

  // All interviews (small dataset)
  const { result: interviewsResult, query: interviewsQuery } = useList({
    resource: "Interview",
    pagination: { mode: "off" },
    meta: {
      fields: [
        "name", "job_applicant", "job_opening", "scheduled_on", "from_time",
        "to_time", "status", "interview_round",
      ],
    },
  });
  const allInterviews = interviewsResult?.data ?? [];

  // Filter out candidates who already have an active interview
  const availableCandidates = useMemo(() => {
    const bookedIds = new Set(
      allInterviews
        .filter((iv: any) => ["Pending", "Under Review"].includes(iv.status))
        .map((iv: any) => iv.job_applicant),
    );
    return candidates.filter((c: any) => !bookedIds.has(c.name));
  }, [candidates, allInterviews]);

  // Active employees (for interviewer dropdown)
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "employee_name", "user_id"] },
  });
  const employees = (employeesResult?.data ?? []).filter(
    (e: any) => e.user_id,
  );

  // Job Openings (for resolving position titles)
  const { result: jobOpeningsResult } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
  });
  const jobOpenings = jobOpeningsResult?.data ?? [];

  // Interview Rounds
  const { result: roundsResult } = useList({
    resource: "Interview Round",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const rounds = roundsResult?.data ?? [];

  // Fetch interviewer details by fetching full Interview docs
  // Child tables (interview_details) are only available via getOne, not getList
  // Since the dataset is small (~20 max), we fetch each interview's details
  const [interviewerMap, setInterviewerMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (allInterviews.length === 0) return;
    const fetchDetails = async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        allInterviews.map(async (iv: any) => {
          try {
            const res = await fetch(
              `/api/resource/Interview/${encodeURIComponent(iv.name)}`,
              { credentials: "include" },
            );
            const data = await res.json();
            const details = data?.data?.interview_details ?? [];
            if (details.length > 0) {
              map[iv.name] = details[0].interviewer;
            }
          } catch { /* skip */ }
        }),
      );
      setInterviewerMap(map);
    };
    fetchDetails();
  }, [allInterviews]);

  const dayInterviews = allInterviews.filter(
    (iv: any) => iv.scheduled_on === selectedDate,
  );

  // Enriched interview list for conflict detection
  const allInterviewsEnriched: InterviewWithInterviewer[] = useMemo(() => {
    return allInterviews.map((iv: any) => ({
      name: iv.name,
      job_applicant: iv.job_applicant,
      scheduled_on: iv.scheduled_on,
      from_time: iv.from_time,
      to_time: iv.to_time,
      status: iv.status,
      interviewer: interviewerMap[iv.name],
    }));
  }, [allInterviews, interviewerMap]);

  // Day view table data
  const dayTableData = useMemo(() => {
    const sorted = [...dayInterviews].sort((a: any, b: any) =>
      a.from_time.localeCompare(b.from_time),
    );
    return sorted.map((iv: any) => {
      const candidate = candidates.find((c: any) => c.name === iv.job_applicant);
      const ivInterviewer = interviewerMap[iv.name];
      const interviewer = ivInterviewer
        ? employees.find((e: any) => e.user_id === ivInterviewer)
        : null;
      const opening = iv.job_opening
        ? jobOpenings.find((jo: any) => jo.name === iv.job_opening)
        : null;
      return {
        ...iv,
        candidateName: candidate?.applicant_name ?? iv.job_applicant,
        jobTitle: opening?.job_title ?? iv.job_opening ?? "",
        interviewerName: interviewer?.employee_name ?? ivInterviewer ?? "-",
      };
    });
  }, [dayInterviews, candidates, interviewerMap, employees, jobOpenings]);

  // Conflict detection
  const conflicts = useMemo(
    () =>
      detectConflicts(
        formDate,
        formFromTime,
        formToTime,
        formCandidate,
        formInterviewer,
        allInterviewsEnriched,
      ),
    [formDate, formFromTime, formToTime, formCandidate, formInterviewer, allInterviewsEnriched],
  );

  const canSchedule =
    formCandidate && formDate && formFromTime && formToTime && formInterviewer && conflicts.length === 0;

  // --- Handlers ---

  async function ensureInterviewRound(): Promise<string> {
    if (rounds.length > 0) return rounds[0].name;
    // Create a default round (expected_skill_set is mandatory)
    await customMutation({
      url: "/api/resource/Interview Round",
      method: "post",
      values: {
        round_name: "General Interview",
        expected_skill_set: [{ skill: "General" }],
      },
    });
    invalidate({ resource: "Interview Round", invalidates: ["list"] });
    return "General Interview";
  }

  async function handleSchedule() {
    if (!canSchedule) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const roundName = await ensureInterviewRound();
      // Create Interview doc with child table for interviewer
      // job_opening auto-fetches from job_applicant.job_title (a Link to Job Opening)
      const ivResponse = await customMutation({
        url: "/api/resource/Interview",
        method: "post",
        values: {
          interview_round: roundName,
          job_applicant: formCandidate,
          scheduled_on: formDate,
          from_time: `${formFromTime}:00`,
          to_time: `${formToTime}:00`,
          status: "Pending",
          interview_details: [{ interviewer: formInterviewer }],
        },
      });
      setSuccess("Interview scheduled successfully");

      // Fire-and-forget email notification to interviewer
      try {
        const ivName = (ivResponse as any)?.data?.data?.name;
        const candidate = candidates.find((c: any) => c.name === formCandidate);
        const candidateName = candidate?.applicant_name ?? formCandidate;
        const opening = candidate?.job_title
          ? jobOpenings.find((jo: any) => jo.name === candidate.job_title)
          : null;
        const positionTitle = opening?.job_title ?? "";
        const niceDate = formatDateDisplay(formDate);

        await createDoc({
          resource: "Communication",
          values: {
            communication_type: "Notification",
            communication_medium: "Email",
            subject: `Interview Scheduled: ${candidateName} on ${niceDate}`,
            content: `<p>You have been assigned as interviewer for:</p>
<ul>
  <li><strong>Candidate:</strong> ${candidateName}</li>
  ${positionTitle ? `<li><strong>Position:</strong> ${positionTitle}</li>` : ""}
  <li><strong>Date:</strong> ${niceDate}</li>
  <li><strong>Time:</strong> ${formFromTime} – ${formToTime}</li>
</ul>
${ivName ? `<p><a href="/app/interview/${encodeURIComponent(ivName)}">View Interview in ERPNext</a></p>` : ""}`,
            recipients: formInterviewer,
            send_email: 1,
            reference_doctype: ivName ? "Interview" : undefined,
            reference_name: ivName || undefined,
          },
        });
      } catch {
        // Notification failure should not block success flow
      }
      // Reset form
      setFormCandidate("");
      setFormInterviewer("");
      // Refresh data
      invalidate({ resource: "Interview", invalidates: ["list"] });
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to schedule interview"));
    } finally {
      setSaving(false);
    }
  }

  const isLoading = interviewsQuery?.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Interview Scheduling</h1>
        <div className="flex items-center gap-3">
          <Link
            to="/hr/recruiting/pipeline"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Pipeline
          </Link>
          <Link
            to="/hr/recruiting"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            CV Inbox <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {formatDateDisplay(selectedDate)}
        </span>
        <Badge variant="secondary">{dayTableData.length} interview{dayTableData.length !== 1 ? "s" : ""}</Badge>
      </div>

      {/* Day schedule table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : dayTableData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No interviews scheduled for this date.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Time</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Candidate</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Position</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Interviewer</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dayTableData.map((row: any) => (
                    <tr key={row.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatTimeShort(row.from_time)}-{formatTimeShort(row.to_time)}
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          to={`/hr/recruiting/${row.job_applicant}`}
                          className="text-primary hover:underline"
                        >
                          {row.candidateName}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.jobTitle}</td>
                      <td className="py-2 pr-4">{row.interviewerName}</td>
                      <td className="py-2">
                        <Badge variant={interviewStatusVariant(row.status)}>
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule new interview form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule New Interview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            {/* Candidate */}
            <div className="space-y-1.5">
              <Label htmlFor="candidate">Candidate</Label>
              <select
                id="candidate"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formCandidate}
                onChange={(e) => setFormCandidate(e.target.value)}
              >
                <option value="">Select candidate...</option>
                {availableCandidates.map((c: any) => (
                  <option key={c.name} value={c.name}>
                    {c.applicant_name} — {jobOpenings.find((jo: any) => jo.name === c.job_title)?.job_title ?? c.job_title ?? "No position"}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="interview-date">Date</Label>
              <Input
                id="interview-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            {/* Start time */}
            <div className="space-y-1.5">
              <Label htmlFor="start-time">Start Time</Label>
              <select
                id="start-time"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formFromTime}
                onChange={(e) => setFormFromTime(e.target.value)}
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* End time */}
            <div className="space-y-1.5">
              <Label htmlFor="end-time">End Time</Label>
              <select
                id="end-time"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formToTime}
                onChange={(e) => setFormToTime(e.target.value)}
              >
                {TIME_SLOTS.filter((t) => t > formFromTime).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Interviewer */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="interviewer">Interviewer</Label>
              <select
                id="interviewer"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formInterviewer}
                onChange={(e) => setFormInterviewer(e.target.value)}
              >
                <option value="">Select interviewer...</option>
                {employees.map((e: any) => (
                  <option key={e.name} value={e.user_id}>
                    {e.employee_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Interview Round (only if multiple) */}
            {rounds.length > 1 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Interview Round</Label>
                <p className="text-xs text-muted-foreground">
                  Using: {rounds[0]?.name ?? "General Interview"}
                </p>
              </div>
            )}
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="mt-4 space-y-1">
              {conflicts.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm text-destructive"
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{c.detail}</span>
                </div>
              ))}
            </div>
          )}

          {/* Error / Success */}
          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
          {success && (
            <p className="mt-3 text-sm text-green-600">{success}</p>
          )}

          {/* Submit */}
          <Button
            className="mt-4"
            disabled={!canSchedule || saving}
            onClick={handleSchedule}
          >
            {saving ? "Scheduling..." : "Schedule Interview"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
