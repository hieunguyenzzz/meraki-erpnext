import { useParams } from "react-router-dom";
import { useFrappeGetDoc } from "frappe-react-sdk";
import { formatDate, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EmployeeDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { data: employee } = useFrappeGetDoc("Employee", name ?? "");

  if (!employee) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{employee.employee_name}</h1>
        <Badge variant={employee.status === "Active" ? "success" : "secondary"}>
          {employee.status}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employee ID</span>
              <span>{employee.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Birth</span>
              <span>{formatDate(employee.date_of_birth)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{employee.cell_phone || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{employee.company_email || "-"}</span>
            </div>
            {employee.custom_meraki_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meraki ID</span>
                <span>{employee.custom_meraki_id}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Designation</span>
              <span>{employee.designation || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Department</span>
              <span>{employee.department || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Joining</span>
              <span>{formatDate(employee.date_of_joining)}</span>
            </div>
            {employee.ctc != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CTC</span>
                <span>{formatVND(employee.ctc)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
