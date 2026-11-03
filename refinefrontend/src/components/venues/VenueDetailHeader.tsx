import { Link } from "react-router";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VenueSupplier } from "@/lib/types";

interface Props {
  venue: VenueSupplier;
  onEdit: () => void;
  onDelete: () => void;
}

/** Mobile breadcrumb (the top bar shows it on desktop), serif title with type chip, Edit / Delete. */
export function VenueDetailHeader({ venue, onEdit, onDelete }: Props) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground md:hidden">
        <Link to="/venues" className="hover:text-foreground hover:underline">Venues</Link> / {venue.supplier_name}
      </nav>
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-[40px] md:leading-[44px]">{venue.supplier_name}</h1>
          {venue.custom_venue_type && (
            <div>
              <Badge variant="secondary">{venue.custom_venue_type}</Badge>
            </div>
          )}
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <Button variant="outline" className="max-md:flex-1" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-danger-soft hover:text-destructive max-md:flex-1" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </header>
    </>
  );
}
