import { useParams, Link } from "react-router";
import { useOne } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvoiceDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { result: invoice } = useOne({ resource: "Sales Invoice", id: name! });

  if (!invoice) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const items = invoice.items ?? [];
  const linkedSalesOrder = items.find((item: any) => item.sales_order)?.sales_order;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{invoice.name}</h1>
        <Badge variant={invoice.status === "Paid" ? "success" : "warning"}>
          {invoice.status}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <Link to={`/crm/customers/${invoice.customer}`} className="text-primary hover:underline">
                {invoice.customer_name}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{formatDate(invoice.posting_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{formatVND(invoice.grand_total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Outstanding</span>
              <span>{formatVND(invoice.outstanding_amount)}</span>
            </div>
            {linkedSalesOrder && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales Order</span>
                <Link to={`/crm/weddings/${linkedSalesOrder}`} className="text-primary hover:underline">
                  {linkedSalesOrder}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{item.item_name} x{item.qty}</span>
                    <span>{formatVND(item.amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
