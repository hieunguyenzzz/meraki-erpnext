import { useParams, Link } from "react-router";
import { useOne, useList } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function CustomerDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { result: customer } = useOne({
    resource: "Customer",
    id: name!,
  });

  const { result: ordersResult } = useList({
    resource: "Sales Order",
    pagination: { mode: "off" },
    filters: [{ field: "customer", operator: "eq", value: name! }],
    sorters: [{ field: "transaction_date", order: "desc" }],
    meta: { fields: ["name", "transaction_date", "grand_total", "status"] },
  });

  const orders = ordersResult?.data ?? [];

  if (!customer) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{customer.customer_name}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span>{customer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Group</span>
              <span>{customer.customer_group}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Territory</span>
              <span>{customer.territory}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{customer.mobile_no || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{customer.email_id || "-"}</span>
            </div>
            {customer.custom_meraki_customer_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meraki ID</span>
                <span>{customer.custom_meraki_customer_id}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales Orders ({orders.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-muted-foreground">No orders found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o: any) => (
                    <TableRow key={o.name}>
                      <TableCell>
                        <Link to={`/crm/weddings/${o.name}`} className="font-medium text-primary hover:underline">
                          {o.name}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(o.transaction_date)}</TableCell>
                      <TableCell>{formatVND(o.grand_total)}</TableCell>
                      <TableCell>
                        <Badge variant={o.status === "Completed" ? "success" : "secondary"}>
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
    </div>
  );
}
