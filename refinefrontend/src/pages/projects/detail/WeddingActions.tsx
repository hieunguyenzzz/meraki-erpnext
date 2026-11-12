import { Link } from "react-router";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  name: string;
  /** Roles that may log expenses against this wedding. */
  canAddExpense: boolean;
  onDelete: () => void;
}

/** Hero buttons: add an expense for this wedding, and a menu holding Delete. */
export function WeddingActions({ name, canAddExpense, onDelete }: Props) {
  return (
    <>
      {canAddExpense && (
        <Button asChild>
          <Link to={`/finance/expenses/new?project=${encodeURIComponent(name)}`}>
            <Plus className="h-4 w-4" />
            Add expense
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete wedding
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
