import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PaymentSummary({ salesOrderName }: { salesOrderName: string }) {
  // Fetch Sales Invoices linked to this Sales Order via child table
  const { result: invoiceResult, query: invoiceQuery } = useList({
    resource: "Sales Invoice",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "grand_total", "outstanding_amount", "status", "posting_date"],
      rawFilters: [
        ["Sales Invoice Item", "sales_order", "=", salesOrderName],
      ],
    },
  });

  const invoices = invoiceResult?.data ?? [];
  const invoiceNames = invoices.map((inv: any) => inv.name);

  // Fetch Payment Entries referencing those invoices
  const { result: paymentResult, query: paymentQuery } = useList({
    resource: "Payment Entry",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "payment_type", "paid_amount", "posting_date", "reference_no", "mode_of_payment", "docstatus"],
      rawFilters: invoiceNames.length > 0
        ? [["Payment Entry Reference", "reference_name", "in", invoiceNames]]
        : [["Payment Entry", "name", "=", "__never_match__"]],
    },
    queryOptions: {
      enabled: !invoiceQuery.isLoading,
    },
  });

  const payments = paymentResult?.data ?? [];

  const totalInvoiced = invoices.reduce((sum: number, inv: any) => sum + (inv.grand_total ?? 0), 0);
  const totalPaid = payments
    .filter((p: any) => p.docstatus === 1)
    .reduce((sum: number, p: any) => sum + (p.paid_amount ?? 0), 0);

  if (invoiceQuery.isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Loading...</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Invoiced</p>
            <p className="text-xl font-bold">{formatVND(totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-xl font-bold">{formatVND(totalPaid)}</p>
          </div>
        </div>

        {totalInvoiced > 0 && (
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary rounded-full h-2 transition-all"
              style={{ width: `${Math.min(100, (totalPaid / totalInvoiced) * 100)}%` }}
            />
          </div>
        )}

        {payments.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p: any) => (
                <TableRow key={p.name}>
                  <TableCell>
                    <Link to={`/finance/payments/${p.name}`} className="text-primary hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(p.posting_date)}</TableCell>
                  <TableCell>{p.mode_of_payment || "-"}</TableCell>
                  <TableCell className="text-right">{formatVND(p.paid_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={p.docstatus === 1 ? "success" : "secondary"}>
                      {p.docstatus === 1 ? "Submitted" : p.docstatus === 2 ? "Cancelled" : "Draft"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">No payments recorded</p>
        )}
      </CardContent>
    </Card>
  );
}
