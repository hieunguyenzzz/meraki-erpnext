import { COLUMNS, type ColumnDef } from "@/lib/kanban";
import type { BadgeProps } from "@/components/ui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** Stage badge tone, from the redesign status tokens (New is neutral, Won sage, Lost danger). */
export const STAGE_BADGE: Record<ColumnDef["key"], BadgeVariant> = {
  new: "secondary",
  engaged: "info",
  meeting: "warning",
  quoted: "default",
  won: "success",
  lost: "destructive",
};

/** The pipeline stage a Lead status belongs to; unknown statuses fall into New, like the board. */
export function stageForLeadStatus(status: string | undefined): ColumnDef {
  return COLUMNS.find((c) => c.leadStatuses.includes(status ?? "")) ?? COLUMNS[0];
}
