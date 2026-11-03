export interface Applicant {
  name: string;
  applicant_name?: string;
  email_id?: string;
  phone_number?: string;
  job_title?: string;
  source?: string;
  applicant_rating?: number;
  creation?: string;
  cover_letter?: string;
  resume_attachment?: string;
  custom_recruiting_stage?: string;
  status?: string;
  custom_city?: string;
  custom_linkedin_url?: string;
  lower_range?: number;
  custom_education_degree?: string;
  custom_education_institution?: string;
  custom_education_graduation_year?: number;
  custom_work_experience?: string;
}

export interface InterviewRow {
  name: string;
  interview_round?: string;
  scheduled_on?: string;
  status?: string;
}

export interface OfferRow {
  name: string;
  designation?: string;
  offer_date?: string;
  status?: string;
}

export interface CommentRow {
  name: string;
  content: string;
  owner: string;
  creation: string;
}

export interface MentionUser {
  id: string;
  display: string;
}

export function stageBadgeVariant(stage: string) {
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
