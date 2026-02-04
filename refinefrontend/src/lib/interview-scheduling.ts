// Time slots from 08:00 to 17:30 in 30-min increments
export const TIME_SLOTS: string[] = [];
for (let h = 8; h < 18; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 17 || (h === 17 && false)) {
    TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
  }
}
// Results in: ["08:00","08:30","09:00",...,"17:00","17:30"]

export const DEFAULT_DURATION_MINUTES = 60;

export function getEndTime(startTime: string, durationMinutes: number): string {
  const mins = timeToMinutes(startTime) + durationMinutes;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function formatTimeShort(t: string): string {
  // "9:00:00" or "09:00:00" or "09:00" -> "09:00"
  const parts = t.split(":");
  const h = parts[0].padStart(2, "0");
  const m = parts[1] ?? "00";
  return `${h}:${m}`;
}

export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);
  return aS < bE && bS < aE;
}

export interface Conflict {
  type: "interviewer" | "candidate";
  detail: string;
}

export interface InterviewWithInterviewer {
  name: string;
  job_applicant: string;
  scheduled_on: string;
  from_time: string;
  to_time: string;
  status: string;
  interviewer?: string;
}

const ACTIVE_STATUSES = ["Pending", "Under Review"];

export function detectConflicts(
  date: string,
  fromTime: string,
  toTime: string,
  candidateId: string,
  interviewerId: string,
  existingInterviews: InterviewWithInterviewer[],
): Conflict[] {
  const conflicts: Conflict[] = [];
  if (!date || !fromTime || !toTime) return conflicts;

  const sameDayActive = existingInterviews.filter(
    (iv) => iv.scheduled_on === date && ACTIVE_STATUSES.includes(iv.status),
  );

  for (const iv of sameDayActive) {
    const ivFrom = formatTimeShort(iv.from_time);
    const ivTo = formatTimeShort(iv.to_time);
    if (!timesOverlap(fromTime, toTime, ivFrom, ivTo)) continue;

    if (interviewerId && iv.interviewer === interviewerId) {
      conflicts.push({
        type: "interviewer",
        detail: `Interviewer already booked ${ivFrom}-${ivTo}`,
      });
    }
    if (candidateId && iv.job_applicant === candidateId) {
      conflicts.push({
        type: "candidate",
        detail: `Candidate already has interview ${ivFrom}-${ivTo}`,
      });
    }
  }

  return conflicts;
}

export function interviewStatusVariant(
  status: string,
): "default" | "secondary" | "success" | "destructive" | "warning" | "info" {
  switch (status) {
    case "Pending":
      return "warning";
    case "Under Review":
      return "info";
    case "Cleared":
      return "success";
    case "Rejected":
      return "destructive";
    default:
      return "secondary";
  }
}
