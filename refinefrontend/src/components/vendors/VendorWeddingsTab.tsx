import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface VendorWedding {
  name: string;
  project_name?: string;
  expected_end_date?: string;
  status?: string;
}

export function VendorWeddingsTab({ weddings }: { weddings: VendorWedding[] }) {
  if (weddings.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No weddings with this vendor yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wedding</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {weddings.map((w) => (
            <TableRow key={w.name}>
              <TableCell className="font-medium">
                <Link to={`/projects/${w.name}`} className="inline-flex min-h-[44px] items-center text-primary hover:underline md:min-h-0">
                  {w.project_name || w.name}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{w.expected_end_date || "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary">{w.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
