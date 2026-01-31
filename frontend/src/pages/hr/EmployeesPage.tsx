import { Link } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function EmployeesPage() {
  const { data, isLoading } = useFrappeGetDocList("Employee", {
    fields: ["name", "employee_name", "designation", "department", "status"],
    orderBy: { field: "employee_name", order: "asc" },
    limit_start: 0,
    limit: 0,
  });

  const employees = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Employees</h1>

      <Card>
        <CardHeader>
          <CardTitle>All Employees ({employees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.name}>
                    <TableCell>
                      <Link to={`/hr/employees/${e.name}`} className="font-medium text-primary hover:underline">
                        {e.employee_name}
                      </Link>
                    </TableCell>
                    <TableCell>{e.designation || "-"}</TableCell>
                    <TableCell>{e.department || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "Active" ? "success" : "secondary"}>
                        {e.status}
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
