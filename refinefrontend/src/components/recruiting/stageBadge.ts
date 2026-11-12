import type { BadgeProps } from "@/components/ui/badge";

/** Recruiting stage badge tone, from the redesign status tokens. */
export const STAGE_BADGE: Record<string, NonNullable<BadgeProps["variant"]>> = {
  Applied: "secondary",
  Screening: "warning",
  Interview: "info",
  Offer: "default",
  Hired: "success",
  Rejected: "destructive",
};
