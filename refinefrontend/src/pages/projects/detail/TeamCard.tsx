import { useState } from "react";
import { EditIconButton, SectionCard } from "@/components/wedding/SectionCard";
import { TeamList } from "@/components/wedding/TeamAvatars";
import { teamMembersOf } from "./teamMembers";
import { TeamEditSheet } from "./TeamEditSheet";
import type { WeddingData } from "./useWeddingData";

export function TeamCard({ w }: { w: WeddingData }) {
  const members = teamMembersOf(w);
  const [editOpen, setEditOpen] = useState(false);
  if (members.length === 0) return null;
  return (
    <SectionCard title="Team" action={w.isWeddingManager && <EditIconButton label="Edit team" onClick={() => setEditOpen(true)} />}>
      <TeamList members={members} />
      {w.isWeddingManager && <TeamEditSheet w={w} open={editOpen} onOpenChange={setEditOpen} />}
    </SectionCard>
  );
}
