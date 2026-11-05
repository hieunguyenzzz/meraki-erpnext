import { useState } from "react";
import { EditIconButton, FactList, SectionCard } from "@/components/wedding/SectionCard";
import { formatIsoWeekday } from "@/lib/format";
import { SalesEditSheet } from "./SalesEditSheet";
import type { WeddingData } from "./useWeddingData";

export function SalesCard({ w }: { w: WeddingData }) {
  const { project, getEmployeeName, isWeddingManager } = w;
  const [editOpen, setEditOpen] = useState(false);
  if (!project) return null;
  return (
    <SectionCard title="Sales information" action={isWeddingManager && <EditIconButton label="Edit sales information" onClick={() => setEditOpen(true)} />}>
      <FactList
        rows={[
          { label: "Sold by", value: getEmployeeName(project.custom_sales_person) || "—" },
          { label: "Booking date", value: project.custom_booking_date ? formatIsoWeekday(project.custom_booking_date) : "—" },
        ]}
      />
      <SalesEditSheet w={w} open={editOpen} onOpenChange={setEditOpen} />
    </SectionCard>
  );
}
