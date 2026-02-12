export type RecruitingStage =
  | "Applied"
  | "Screening"
  | "Interview"
  | "Offer"
  | "Hired"
  | "Rejected";

export interface RecruitingItem {
  id: string; // Job Applicant name
  applicantName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  source?: string;
  rating: number;
  creation: string;
  stage: RecruitingStage;
  coverLetter?: string;
  resumeAttachment?: string;
  hasInterview: boolean;
  hasOffer: boolean;
}

export const PIPELINE_COLUMNS = [
  { key: "Screening", label: "Screening", color: "amber" },
  { key: "Interview", label: "Interview", color: "purple" },
  { key: "Offer", label: "Offer", color: "indigo" },
  { key: "Hired", label: "Hired", color: "green" },
  { key: "Rejected", label: "Rejected", color: "rose" },
] as const;

export function getPipelineColumn(item: RecruitingItem): string {
  return item.stage;
}

export function buildRecruitingItems(applicants: any[]): RecruitingItem[] {
  return applicants.map((a) => ({
    id: a.name,
    applicantName: a.applicant_name || a.name,
    email: a.email_id,
    phone: a.phone_number,
    jobTitle: a.job_title,
    source: a.source,
    rating: a.applicant_rating ?? 0,
    creation: a.creation,
    stage: a.custom_recruiting_stage || "Applied",
    coverLetter: a.cover_letter,
    resumeAttachment: a.resume_attachment,
    hasInterview: false,
    hasOffer: false,
  }));
}

export function enrichRecruitingItems(
  items: RecruitingItem[],
  interviews: any[],
  offers: any[],
): RecruitingItem[] {
  const interviewSet = new Set(interviews.map((i) => i.job_applicant));
  const offerSet = new Set(offers.map((o) => o.job_applicant));
  return items.map((item) => ({
    ...item,
    hasInterview: interviewSet.has(item.id),
    hasOffer: offerSet.has(item.id),
  }));
}
