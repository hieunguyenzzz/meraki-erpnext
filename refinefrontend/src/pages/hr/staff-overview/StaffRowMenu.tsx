import { Link } from "react-router";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { displayName } from "@/lib/format";
import type { StaffRow } from "./types";

interface Props {
  row: StaffRow;
  canManageRoles: boolean;
  canReview: boolean;
  onReview: (row: StaffRow) => void;
  onRoles: (row: StaffRow) => void;
}

/** Desktop row actions: profile, review, and (admins only) assign roles. */
export function StaffRowMenu({ row, canManageRoles, canReview, onReview, onRoles }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${displayName(row)}`} className="h-9 w-9">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={`/hr/employees/${row.name}`}>View profile</Link>
        </DropdownMenuItem>
        {canReview && <DropdownMenuItem onSelect={() => onReview(row)}>Review</DropdownMenuItem>}
        {canManageRoles && <DropdownMenuItem onSelect={() => onRoles(row)}>Assign roles</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
