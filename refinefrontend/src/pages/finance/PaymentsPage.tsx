import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function statusVariant(docstatus: number) {
  if (docstatus === 1) return "success" as const;
  if (docstatus === 2) return "destructive" as const;
  return "secondary" as const;
}

function statusLabel(docstatus: number) {
  if (docstatus === 1) return "Submitted";
  if (docstatus === 2) return "Cancelled";
  return "Draft";
}

export default function PaymentsPage() {
  const { result, query } = useList({
    resource: "Payment Entry",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: {
      fields: [
        "name", "payment_type", "party", "party_name", "posting_date",
        "paid_amount", "mode_of_payment", "reference_no", "docstatus",
      ],
    },
  });

  const payments = result?.data ?? [];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Payments</h1>

      <Card>
        <CardHeader>
          <CardTitle>All Payments ({payments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: any) => (
                  <TableRow key={p.name}>
                    <TableCell>
                      <Link to={`/finance/payments/${p.name}`} className="font-medium text-primary hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.payment_type === "Receive" ? "success" : "warning"}>
                        {p.payment_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.party_name || p.party}</TableCell>
                    <TableCell>{formatDate(p.posting_date)}</TableCell>
                    <TableCell>{formatVND(p.paid_amount)}</TableCell>
                    <TableCell>{p.mode_of_payment || "-"}</TableCell>
                    <TableCell>{p.reference_no || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(p.docstatus)}>
                        {statusLabel(p.docstatus)}
                      </Badge>
                    </TableCell>
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
