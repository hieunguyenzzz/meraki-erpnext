import { useParams, Link } from "react-router-dom";
import { useFrappeGetDoc } from "frappe-react-sdk";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function WeddingDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { data: order } = useFrappeGetDoc("Sales Order", name ?? "");

  if (!order) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const items = order.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{order.name}</h1>
        <Badge variant={order.status === "Completed" ? "success" : "secondary"}>
          {order.status}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wedding Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <Link to={`/crm/customers/${order.customer}`} className="text-primary hover:underline">
                {order.customer_name}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{formatDate(order.transaction_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{formatVND(order.grand_total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivered</span>
              <span>{order.per_delivered}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Billed</span>
              <span>{order.per_billed}%</span>
            </div>
            {order.project && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Project</span>
                <span>{order.project}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: { item_name: string; qty: number; rate: number; amount: number }, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{item.item_name}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell className="text-right">{formatVND(item.rate)}</TableCell>
                      <TableCell className="text-right">{formatVND(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground">No items</p>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
