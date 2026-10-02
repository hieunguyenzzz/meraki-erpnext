import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime24, formatTime24 } from "./format";
import type { FlightSegment } from "./types";

export function FlightSegmentsTable({ segments }: { segments: FlightSegment[] }) {
  if (!segments.length) return <p className="text-sm text-muted-foreground">No segments.</p>;
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Flight</TableHead>
            <TableHead>Route</TableHead>
            <TableHead>Departure</TableHead>
            <TableHead>Arrival</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {segments.map((s) => (
            <TableRow key={s.name}>
              <TableCell className="font-mono text-xs">{s.flight_no}</TableCell>
              <TableCell className="whitespace-nowrap">{s.origin} → {s.destination}</TableCell>
              <TableCell className="whitespace-nowrap">
                {s.original_departure && s.original_departure !== s.departure && (
                  <span className="mr-2 text-muted-foreground line-through">
                    {formatDateTime24(s.original_departure)}
                  </span>
                )}
                {formatDateTime24(s.departure)}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatTime24(s.arrival)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
