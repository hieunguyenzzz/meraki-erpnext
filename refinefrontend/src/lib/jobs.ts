/** Shared types and utilities for public job pages. */

export interface Job {
  name: string;
  job_title: string;
  status: string;
  location: string;
  closes_on: string;
  custom_application_level: string;
  description: string;
}

export function formatClosesOn(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
