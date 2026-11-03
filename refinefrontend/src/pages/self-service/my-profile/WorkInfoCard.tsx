import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmployeeProfile } from "@/lib/types";
import { ReadOnlyRow } from "./Field";

export function WorkInfoCard({ employee }: { employee: EmployeeProfile }) {
  return (
    <Card className="bg-muted/50">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3 sm:pb-4">
        <CardTitle>Work info</CardTitle>
        <span className="text-xs text-muted-foreground">Managed by HR</span>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm">
        <ReadOnlyRow label="Employee ID">{employee.name}</ReadOnlyRow>
        <ReadOnlyRow label="Department">{employee.department}</ReadOnlyRow>
        <ReadOnlyRow label="Designation">{employee.designation}</ReadOnlyRow>
        <ReadOnlyRow label="Date of Joining">{employee.date_of_joining}</ReadOnlyRow>
      </CardContent>
    </Card>
  );
}
