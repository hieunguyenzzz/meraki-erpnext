import type { TeamMember } from "@/components/wedding/TeamAvatars";
import type { WeddingData } from "./useWeddingData";

/** Team members with a role and (Finance only) their commission rate. */
export function teamMembersOf(w: WeddingData): TeamMember[] {
  const { project, teamIds, getEmployeeName, isFinance } = w;
  if (!project) return [];
  const pct = (v: number | null | undefined, show = true) => (isFinance && show && v ? ` · ${v}%` : "");
  const members: TeamMember[] = [];
  if (teamIds.lead) members.push({ id: teamIds.lead, name: getEmployeeName(teamIds.lead)!, role: `Lead planner${pct(project.custom_lead_commission_pct)}` });
  if (teamIds.support) members.push({ id: teamIds.support, name: getEmployeeName(teamIds.support)!, role: `Support planner${pct(project.custom_support_commission_pct)}` });
  teamIds.assistants.forEach((id, i) =>
    members.push({ id, name: getEmployeeName(id)!, role: `Assistant ${i + 1}${pct(project.custom_assistant_commission_pct, i === 0)}` })
  );
  return members;
}
