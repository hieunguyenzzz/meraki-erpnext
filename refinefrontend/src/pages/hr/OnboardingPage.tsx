import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

function statusVariant(status: string) {
  switch (status) {
    case "Completed": return "success" as const;
    case "In Process": return "default" as const;
    default: return "secondary" as const;
  }
}

export default function OnboardingPage() {
  const { result, query } = useList({
    resource: "Employee Onboarding",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: { fields: ["name", "employee_name", "boarding_status", "department", "designation"] },
  });

  const onboardings = result?.data ?? [];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Onboarding</h1>

      <Card>
        <CardHeader>
          <CardTitle>Employee Onboarding ({onboardings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : onboardings.length === 0 ? (
            <p className="text-muted-foreground">No onboarding records found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {onboardings.map((ob: any) => (
                  <TableRow key={ob.name}>
                    <TableCell>
                      <Link to={`/hr/onboarding/${ob.name}`} className="font-medium text-primary hover:underline">
                        {ob.employee_name}
                      </Link>
                    </TableCell>
                    <TableCell>{ob.department || "-"}</TableCell>
                    <TableCell>{ob.designation || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(ob.boarding_status)}>{ob.boarding_status}</Badge>
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
