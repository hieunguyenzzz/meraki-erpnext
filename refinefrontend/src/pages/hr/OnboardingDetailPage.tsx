import { useParams } from "react-router";
import { useOne } from "@refinedev/core";
import { formatDate } from "@/lib/format";
import type { OnboardingActivity } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle } from "lucide-react";

function statusVariant(status: string) {
  switch (status) {
    case "Completed": return "success" as const;
    case "In Process": return "default" as const;
    default: return "secondary" as const;
  }
}

export default function OnboardingDetailPage() {
  const { name } = useParams<{ name: string }>();

  const { result: onboarding } = useOne({ resource: "Employee Onboarding", id: name! });

  if (!onboarding) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const activities = (onboarding.activities ?? []) as OnboardingActivity[];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{onboarding.employee_name}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span>{onboarding.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employee</span>
              <span>{onboarding.employee_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={statusVariant(onboarding.boarding_status)}>{onboarding.boarding_status}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Department</span>
              <span>{onboarding.department || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Designation</span>
              <span>{onboarding.designation || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Joining</span>
              <span>{formatDate(onboarding.date_of_joining)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activities ({activities.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-muted-foreground">No activities defined</p>
            ) : (
              <ul className="space-y-3">
                {activities.map((activity, i) => (
                  <li key={i} className="flex items-start gap-3">
                    {activity.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <div className={`font-medium ${activity.completed ? "line-through text-muted-foreground" : ""}`}>
                        {activity.activity_name}
                      </div>
                      {activity.user && (
                        <div className="text-xs text-muted-foreground">Assigned: {activity.user}</div>
                      )}
                      {activity.description && (
                        <div className="text-xs text-muted-foreground mt-1">{activity.description}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
