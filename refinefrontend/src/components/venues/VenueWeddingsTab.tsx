import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatVND } from "@/lib/format";

export interface VenueWedding {
  name: string;
  customer_name?: string;
  delivery_date?: string;
  status?: string;
  grand_total?: number;
  project?: string;
}

function soStatusVariant(s: string): "success" | "destructive" | "warning" | "secondary" {
  if (s === "Completed") return "success";
  if (s === "Cancelled") return "destructive";
  if (s === "To Deliver and Bill") return "warning";
  return "secondary";
}

export function VenueWeddingsTab({ weddings }: { weddings: VenueWedding[] }) {
  if (weddings.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No weddings at this venue yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Couple</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {weddings.map((w) => (
            <TableRow key={w.name}>
              <TableCell className="font-medium">
                {w.project ? (
                  <Link to={`/projects/${w.project}`} className="text-primary hover:underline">
                    {w.customer_name}
                  </Link>
                ) : (
                  w.customer_name
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {w.delivery_date ? formatDate(w.delivery_date) : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={soStatusVariant(w.status ?? "")}>{w.status}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums">
                {w.grand_total ? formatVND(w.grand_total) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
