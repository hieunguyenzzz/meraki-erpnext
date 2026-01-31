import { useParams, Link } from "react-router";
import { useOne } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FileAttachments from "@/components/FileAttachments";

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

export default function PaymentDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { result: payment } = useOne({ resource: "Payment Entry", id: name! });

  if (!payment) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const refs = payment.references ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{payment.name}</h1>
        <Badge variant={payment.payment_type === "Receive" ? "success" : "warning"}>
          {payment.payment_type}
        </Badge>
        <Badge variant={statusVariant(payment.docstatus)}>
          {statusLabel(payment.docstatus)}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Party</span>
              <span>{payment.party_name || payment.party}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{formatDate(payment.posting_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold">{formatVND(payment.paid_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mode</span>
              <span>{payment.mode_of_payment || "-"}</span>
            </div>
            {payment.reference_no && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference #</span>
                <span>{payment.reference_no}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {refs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Linked Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refs.map((ref: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{ref.reference_doctype}</TableCell>
                      <TableCell>
                        {ref.reference_doctype === "Sales Invoice" ? (
                          <Link
                            to={`/finance/invoices/${ref.reference_name}`}
                            className="text-primary hover:underline"
                          >
                            {ref.reference_name}
                          </Link>
                        ) : ref.reference_doctype === "Purchase Invoice" ? (
                          <Link
                            to={`/finance/expenses/${ref.reference_name}`}
                            className="text-primary hover:underline"
                          >
                            {ref.reference_name}
                          </Link>
                        ) : (
                          ref.reference_name
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatVND(ref.allocated_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <FileAttachments doctype="Payment Entry" docname={name!} />
    </div>
  );
}
