import { useParams } from "react-router";
import { useOne } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FileAttachments from "@/components/FileAttachments";

function statusVariant(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Overdue") return "destructive" as const;
  if (status === "Cancelled") return "destructive" as const;
  return "warning" as const;
}

export default function ExpenseDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { result: expense } = useOne({ resource: "Purchase Invoice", id: name! });

  if (!expense) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const items = expense.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{expense.name}</h1>
        <Badge variant={statusVariant(expense.status)}>
          {expense.status}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expense Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Supplier</span>
              <span>{expense.supplier_name || expense.supplier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{formatDate(expense.posting_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{formatVND(expense.grand_total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Outstanding</span>
              <span>{formatVND(expense.outstanding_amount)}</span>
            </div>
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
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
                  {items.map((item: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{item.item_name}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell className="text-right">{formatVND(item.rate)}</TableCell>
                      <TableCell className="text-right">{formatVND(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <FileAttachments doctype="Purchase Invoice" docname={name!} />
    </div>
  );
}
