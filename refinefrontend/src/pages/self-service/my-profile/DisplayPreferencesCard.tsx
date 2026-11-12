import { useState } from "react";
import { usePermissions } from "@refinedev/core";
import { getDashboardOptions, type DashboardOption } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Default Dashboard preference (localStorage); rendered only when the user has more than one dashboard. */
export function DisplayPreferencesCard() {
  const { data: roles } = usePermissions<string[]>({});
  const dashboardOptions = getDashboardOptions(roles ?? []);

  const [dashboardPref, setDashboardPref] = useState<DashboardOption>(() => {
    const stored = localStorage.getItem("meraki-dashboard-preference") as DashboardOption | null;
    if (stored && ["personal", "director"].includes(stored)) return stored;
    return "personal";
  });

  function handleChange(value: DashboardOption) {
    setDashboardPref(value);
    localStorage.setItem("meraki-dashboard-preference", value);
  }

  if (dashboardOptions.length <= 1) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Default Dashboard</p>
            <p className="text-xs text-muted-foreground">Choose what you see when you open the app</p>
          </div>
          <Select value={dashboardPref} onValueChange={handleChange}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dashboardOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt === "director" ? "Director Dashboard" : "Personal Dashboard"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
