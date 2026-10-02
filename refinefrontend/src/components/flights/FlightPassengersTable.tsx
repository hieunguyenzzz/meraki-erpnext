import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchableSelect } from "./SearchableSelect";
import { formatAmount } from "./format";
import type { FlightPassenger, Option } from "./types";

export interface PassengerDraft {
  employee: string;
  total: string;
}

interface Props {
  passengers: FlightPassenger[];
  currency: string;
  drafts: Record<string, PassengerDraft>;   // keyed by ticket_number
  onDraftChange: (ticketNumber: string, draft: PassengerDraft) => void;
  staffOptions: Option[];
  canEditTotal: boolean;                    // finance only; the API returns 403 otherwise
}

export function FlightPassengersTable({ passengers, currency, drafts, onDraftChange, staffOptions, canEditTotal }: Props) {
  if (!passengers.length) return <p className="text-sm text-muted-foreground">No passengers.</p>;
  return (
    <TooltipProvider>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Passenger</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead className="text-right">Fare</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Change fees</TableHead>
              <TableHead className="text-right">Extras</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {passengers.map((p) => {
              const draft = drafts[p.ticket_number] ?? { employee: p.employee ?? "", total: String(p.total ?? "") };
              return (
                <TableRow key={p.name}>
                  <TableCell className="whitespace-nowrap">{p.passenger_name}</TableCell>
                  <TableCell>
                    <SearchableSelect
                      options={staffOptions}
                      value={draft.employee}
                      onChange={(employee) => onDraftChange(p.ticket_number, { ...draft, employee })}
                      placeholder="Unmatched"
                      clearLabel="Unmatched"
                      searchPlaceholder="Search staff..."
                      className={draft.employee ? undefined : "border-amber-300 text-amber-700"}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-mono text-xs">{p.ticket_number}</span>
                    {p.previous_ticket_numbers && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" aria-label="Previous tickets" />
                        </TooltipTrigger>
                        <TooltipContent>Previous: {p.previous_ticket_numbers}</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatAmount(p.fare, currency)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canEditTotal ? (
                      <Input
                        type="number"
                        step="any"
                        className="h-8 w-32 text-right"
                        value={draft.total}
                        onChange={(e) => onDraftChange(p.ticket_number, { ...draft, total: e.target.value })}
                      />
                    ) : (
                      formatAmount(p.total, currency)
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatAmount(p.change_fees, currency)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {p.extras_detail ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted">{formatAmount(p.extras, currency)}</span>
                        </TooltipTrigger>
                        <TooltipContent>{p.extras_detail}</TooltipContent>
                      </Tooltip>
                    ) : (
                      formatAmount(p.extras, currency)
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
