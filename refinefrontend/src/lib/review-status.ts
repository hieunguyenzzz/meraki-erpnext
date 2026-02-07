/**
 * Review status utilities for Staff Overview page
 */

export type ReviewStatus = "overdue" | "due-soon" | "up-to-date" | "never-reviewed";

export type BadgeVariant = "destructive" | "warning" | "success" | "secondary";

/**
 * Calculate review status based on last review date
 * - Never reviewed: critical
 * - > 6 months ago: overdue (critical)
 * - 5-6 months ago: due-soon (warning)
 * - < 5 months ago: up-to-date (ok)
 */
export function getReviewStatus(lastReviewDate: string | null | undefined): ReviewStatus {
  if (!lastReviewDate) return "never-reviewed";

  const lastReview = new Date(lastReviewDate);
  const now = new Date();
  const monthsAgo = getMonthsDifference(lastReview, now);

  if (monthsAgo > 6) return "overdue";
  if (monthsAgo >= 5) return "due-soon";
  return "up-to-date";
}

/**
 * Calculate months difference between two dates
 */
export function getMonthsDifference(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  // Adjust for partial months
  if (to.getDate() < from.getDate()) {
    return months - 1;
  }
  return months;
}

/**
 * Get next review due date (6 months after last review)
 */
export function getNextReviewDate(lastReviewDate: string): Date {
  const lastReview = new Date(lastReviewDate);
  const nextReview = new Date(lastReview);
  nextReview.setMonth(nextReview.getMonth() + 6);
  return nextReview;
}

/**
 * Get days until review is due (negative if overdue)
 */
export function getDaysUntilDue(lastReviewDate: string): number {
  const nextReview = getNextReviewDate(lastReviewDate);
  const now = new Date();
  const diffTime = nextReview.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get badge variant based on review status
 */
export function getReviewBadgeVariant(status: ReviewStatus): BadgeVariant {
  switch (status) {
    case "overdue":
    case "never-reviewed":
      return "destructive";
    case "due-soon":
      return "warning";
    case "up-to-date":
      return "success";
  }
}

/**
 * Get human-readable review status text
 */
export function getReviewStatusText(lastReviewDate: string | null | undefined): string {
  if (!lastReviewDate) return "Never reviewed";

  const lastReview = new Date(lastReviewDate);
  const now = new Date();
  const monthsAgo = getMonthsDifference(lastReview, now);
  const status = getReviewStatus(lastReviewDate);

  const timeAgo = monthsAgo === 0 ? "This month" : monthsAgo === 1 ? "1 month ago" : `${monthsAgo} months ago`;

  switch (status) {
    case "overdue":
      return `${timeAgo} - OVERDUE`;
    case "due-soon":
      return `${timeAgo} - Review soon`;
    case "up-to-date":
      return timeAgo;
    default:
      return "Never reviewed";
  }
}

/**
 * Get badge variant for leave balance display
 * - Green: > 50% remaining
 * - Amber: 25-50% remaining
 * - Red: < 25% remaining
 */
export function getLeaveBalanceVariant(remaining: number, total: number): BadgeVariant {
  if (total === 0) return "secondary";
  const percentage = (remaining / total) * 100;
  if (percentage > 50) return "success";
  if (percentage >= 25) return "warning";
  return "destructive";
}
