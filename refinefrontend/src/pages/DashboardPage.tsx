import { useState } from "react";
import { usePermissions } from "@refinedev/core";
import DirectorSection from "@/components/dashboard/DirectorSection";
import PersonalHome from "@/components/dashboard/PersonalHome";
import { getDashboardOptions, type DashboardOption } from "@/lib/roles";

function Home({ roles }: { roles: string[] }) {
  const dashboardOptions = getDashboardOptions(roles);
  const [pref] = useState<DashboardOption>(() => {
    const stored = typeof window === "undefined" ? null : (localStorage.getItem("meraki-dashboard-preference") as DashboardOption | null);
    return stored && dashboardOptions.includes(stored) ? stored : (dashboardOptions[0] ?? "personal");
  });
  return pref === "director" ? <DirectorSection /> : <PersonalHome />;
}

/** Home: director overview or personal view, per the role-eligible preference saved in the profile. */
export default function DashboardPage() {
  const { data: roles } = usePermissions<string[]>({});
  // Wait for roles so the wrong view (and its queries) never mounts first.
  if (!roles) return null;
  return <Home roles={roles} />;
}
