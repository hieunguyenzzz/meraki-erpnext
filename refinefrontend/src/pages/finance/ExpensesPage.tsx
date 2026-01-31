import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { formatVND, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function statusVariant(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Overdue") return "destructive" as const;
  if (status === "Cancelled") return "destructive" as const;
  return "warning" as const;
}

export default function ExpensesPage() {
  const { result, query } = useList({
    resource: "Purchase Invoice",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: {
      fields: [
        "name", "supplier", "supplier_name", "posting_date",
        "grand_total", "outstanding_amount", "status",
      ],
    },
  });

  const expenses = result?.data ?? [];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Expenses</h1>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Invoices ({expenses.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : expenses.length === 0 ? (
            <p className="text-muted-foreground">No purchase invoices found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((exp: any) => (
                  <TableRow key={exp.name}>
                    <TableCell>
                      <Link to={`/finance/expenses/${exp.name}`} className="font-medium text-primary hover:underline">
                        {exp.name}
                      </Link>
                    </TableCell>
                    <TableCell>{exp.supplier_name || exp.supplier}</TableCell>
                    <TableCell>{formatDate(exp.posting_date)}</TableCell>
                    <TableCell>{formatVND(exp.grand_total)}</TableCell>
                    <TableCell>{formatVND(exp.outstanding_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(exp.status)}>
                        {exp.status}
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
