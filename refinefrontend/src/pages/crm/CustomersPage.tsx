import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomersPage() {
  const { result, query } = useList({
    resource: "Customer",
    pagination: { mode: "off" },
    sorters: [{ field: "customer_name", order: "asc" }],
    meta: { fields: ["name", "customer_name", "customer_group", "territory", "mobile_no", "email_id"] },
  });

  const customers = result?.data ?? [];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Customers</h1>

      <Card>
        <CardHeader>
          <CardTitle>All Customers ({customers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c: any) => (
                  <TableRow key={c.name}>
                    <TableCell>
                      <Link to={`/crm/customers/${c.name}`} className="font-medium text-primary hover:underline">
                        {c.customer_name}
                      </Link>
                    </TableCell>
                    <TableCell>{c.customer_group}</TableCell>
                    <TableCell>{c.mobile_no || "-"}</TableCell>
                    <TableCell>{c.email_id || "-"}</TableCell>
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
