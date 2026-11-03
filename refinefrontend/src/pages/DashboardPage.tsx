import { useState } from "react";
import { usePermissions } from "@refinedev/core";
import DirectorSection from "@/components/dashboard/DirectorSection";
import PersonalHome from "@/components/dashboard/PersonalHome";
import { getDashboardOptions, type DashboardOption } from "@/lib/roles";

/** Home: director overview or personal view, per the role-eligible preference saved in the profile. */
export default function DashboardPage() {
  const { data: roles } = usePermissions<string[]>({});
  const dashboardOptions = getDashboardOptions(roles ?? []);
  const [dashboardPref] = useState<DashboardOption>(() => {
    if (typeof window === "undefined") return dashboardOptions[0] ?? "personal";
    const stored = localStorage.getItem("meraki-dashboard-preference") as DashboardOption | null;
    if (stored && dashboardOptions.includes(stored)) return stored;
    return dashboardOptions[0] ?? "personal";
  });
  // Keep pref in sync if roles load after initial render
  const effectivePref = dashboardOptions.includes(dashboardPref) ? dashboardPref : (dashboardOptions[0] ?? "personal");

  return effectivePref === "director" ? <DirectorSection /> : <PersonalHome />;
}
