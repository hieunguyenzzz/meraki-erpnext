import { useEffect, useState } from "react";
import { useList } from "@refinedev/core";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { formatTimeShort, interviewStatusVariant } from "@/lib/interview-scheduling";

/** HR staff: interviews they are on (GET /inquiry-api/dashboard/my-interviews). Renders nothing when empty. */
export function InterviewsCard({ email }: { email: string | undefined }) {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    let cancelled = false;
    fetch(`/inquiry-api/dashboard/my-interviews?email=${encodeURIComponent(email)}`)
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setUpcoming(json.data ?? []); })
      .catch((err: unknown) => console.error("InterviewsCard: my-interviews failed", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [email]);

  const { result: applicantsResult } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    meta: { fields: ["name", "applicant_name", "job_title"] },
    queryOptions: { enabled: upcoming.length > 0 },
  });
  const { result: openingsResult } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
    queryOptions: { enabled: upcoming.length > 0 },
  });
  const applicants = applicantsResult?.data ?? [];
  const openings = openingsResult?.data ?? [];

  if (!loading && upcoming.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[17px] font-semibold">
          <CalendarDays className="h-4 w-4" />
          My upcoming interviews
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="divide-y">
            {upcoming.map((iv: any) => {
              const applicant = applicants.find((a: any) => a.name === iv.job_applicant);
              const opening = iv.job_opening
                ? openings.find((jo: any) => jo.name === iv.job_opening)
                : applicant?.job_title ? openings.find((jo: any) => jo.name === applicant.job_title) : null;
              return (
                <div key={iv.name} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{applicant?.applicant_name ?? iv.job_applicant}</p>
                    {opening?.job_title && <p className="truncate text-xs text-muted-foreground">{opening.job_title}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-right">
                    <div>
                      <p className="text-sm">{formatDate(iv.scheduled_on)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{formatTimeShort(iv.from_time)}-{formatTimeShort(iv.to_time)}</p>
                    </div>
                    <Badge variant={interviewStatusVariant(iv.status)}>{iv.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
