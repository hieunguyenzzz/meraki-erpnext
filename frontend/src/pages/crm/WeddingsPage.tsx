import { Link } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function WeddingsPage() {
  const { data, isLoading } = useFrappeGetDocList("Sales Order", {
    fields: [
      "name", "customer", "customer_name", "transaction_date",
      "grand_total", "status",
    ],
    orderBy: { field: "transaction_date", order: "desc" },
    limit_start: 0,
    limit: 0,
  });

  const orders = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Weddings</h1>

      <Card>
        <CardHeader>
          <CardTitle>All Weddings ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.name}>
                    <TableCell>
                      <Link to={`/crm/weddings/${o.name}`} className="font-medium text-primary hover:underline">
                        {o.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/crm/customers/${o.customer}`} className="hover:underline">
                        {o.customer_name}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(o.transaction_date)}</TableCell>
                    <TableCell>{formatVND(o.grand_total)}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "Completed" ? "success" : o.status === "Draft" ? "secondary" : "default"}>
                        {o.status}
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
