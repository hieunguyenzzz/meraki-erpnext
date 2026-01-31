import { useList } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function JournalsPage() {
  const { result, query } = useList({
    resource: "Journal Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: { fields: ["name", "posting_date", "voucher_type", "total_debit", "total_credit", "user_remark", "docstatus"] },
  });

  const journals = result?.data ?? [];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Journal Entries</h1>

      <Card>
        <CardHeader>
          <CardTitle>All Journal Entries ({journals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Debit</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.map((j: any) => (
                  <TableRow key={j.name}>
                    <TableCell className="font-medium">{j.name}</TableCell>
                    <TableCell>{formatDate(j.posting_date)}</TableCell>
                    <TableCell>{j.voucher_type}</TableCell>
                    <TableCell>{formatVND(j.total_debit)}</TableCell>
                    <TableCell>{formatVND(j.total_credit)}</TableCell>
                    <TableCell>
                      <Badge variant={j.docstatus === 1 ? "success" : "secondary"}>
                        {j.docstatus === 1 ? "Submitted" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{j.user_remark || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
