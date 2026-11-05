import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EditIconButton, FactList, SectionCard } from "@/components/wedding/SectionCard";
import { formatIsoWeekday, formatVNDFull } from "@/lib/format";
import { DetailsEditSheet } from "./DetailsEditSheet";
import type { WeddingData } from "./useWeddingData";

/** Date, venue, package and add-ons. Money rows are Finance only. */
export function DetailsCard({ w }: { w: WeddingData }) {
  const { project, salesOrder, weddingDate, venueName, totalValue, customerName, addOnItems, isFinance, isWeddingManager } = w;
  const [editOpen, setEditOpen] = useState(false);
  if (!project || !(weddingDate || venueName || totalValue > 0 || addOnItems.length > 0)) return null;

  const rows: { label: string; value: React.ReactNode }[] = [{ label: "Couple", value: customerName }];
  if (weddingDate) rows.push({ label: "Date", value: formatIsoWeekday(weddingDate) });
  if (venueName) rows.push({ label: "Venue", value: venueName });
  if (project.custom_service_type || project.custom_wedding_type) {
    rows.push({
      label: "Package",
      value: (
        <span className="flex flex-wrap gap-2">
          {project.custom_service_type && (
            <Badge variant={project.custom_service_type.toLowerCase().includes("full") ? "default" : "secondary"}>{project.custom_service_type}</Badge>
          )}
          {project.custom_wedding_type && <Badge variant="outline">{project.custom_wedding_type}</Badge>}
        </span>
      ),
    });
  }
  if (isFinance && totalValue > 0) {
    rows.push({ label: "Total package", value: formatVNDFull(totalValue) });
    rows.push({ label: "Commission base", value: formatVNDFull(salesOrder?.custom_commission_base || salesOrder?.grand_total || 0) });
  }
  if (isFinance && project.custom_total_budget > 0) rows.push({ label: "Wedding budget", value: formatVNDFull(project.custom_total_budget) });
  if (addOnItems.length > 0) {
    rows.push({
      label: "Add-ons",
      value: (
        <ul className="space-y-1">
          {addOnItems.map((item) => (
            <li key={item.name} className="flex justify-between gap-3">
              <span>{item.item_name}</span>
              {isFinance && <span className="text-muted-foreground">{formatVNDFull(item.amount)}</span>}
            </li>
          ))}
        </ul>
      ),
    });
  }

  return (
    <SectionCard title="Details" action={isWeddingManager && <EditIconButton label="Edit details" onClick={() => setEditOpen(true)} />}>
      <FactList rows={rows} />
      {isWeddingManager && <DetailsEditSheet w={w} open={editOpen} onOpenChange={setEditOpen} />}
    </SectionCard>
  );
}
