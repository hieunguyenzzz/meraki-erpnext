export interface MerakiReview {
  name: string;
  employee: string;
  employee_name?: string;
  review_date: string;
  period?: string;
  average_rating?: number;
  overall_score?: number;
  reviewer?: string;
  creation?: string;
}

/** Manual override wins over the computed average; 0 or missing means "not set". */
export function reviewScore(r: Pick<MerakiReview, "overall_score" | "average_rating">): number | null {
  const o = r.overall_score;
  const a = r.average_rating;
  if (o && o > 0) return o;
  if (a && a > 0) return a;
  return null;
}

export function formatScore(score: number | null): string {
  return score === null ? "-" : `${Number.isInteger(score) ? score : score.toFixed(1)} / 10`;
}

export function isoDate(d: string | undefined | null): string {
  return d ? d.slice(0, 10) : "-";
}

/**
 * Stored notes to plain text for the editor and read-out. Parsed into an inert document
 * (nothing attached to the live page) and only textContent is used, so no markup is ever rendered.
 */
export function notesToPlain(raw: string | undefined | null): string {
  if (!raw) return "";
  const withBreaks = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent ?? "").trim();
}
