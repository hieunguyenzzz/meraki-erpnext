import { Link } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function InvoicesPage() {
  const { data, isLoading } = useFrappeGetDocList("Sales Invoice", {
    fields: ["name", "customer", "customer_name", "posting_date", "grand_total", "outstanding_amount", "status"],
    orderBy: { field: "posting_date", order: "desc" },
    limit_start: 0,
    limit: 0,
  });

  const invoices = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Sales Invoices</h1>

      <Card>
        <CardHeader>
          <CardTitle>All Invoices ({invoices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.name}>
                    <TableCell>
                      <Link to={`/finance/invoices/${inv.name}`} className="font-medium text-primary hover:underline">
                        {inv.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/crm/customers/${inv.customer}`} className="hover:underline">
                        {inv.customer_name}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(inv.posting_date)}</TableCell>
                    <TableCell>{formatVND(inv.grand_total)}</TableCell>
                    <TableCell>{formatVND(inv.outstanding_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "Paid" ? "success" : inv.status === "Overdue" ? "destructive" : "warning"}>
                        {inv.status}
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
