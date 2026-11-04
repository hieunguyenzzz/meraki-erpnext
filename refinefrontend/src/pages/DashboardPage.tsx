import { useState } from "react";
import { usePermissions } from "@refinedev/core";
import DirectorSection from "@/components/dashboard/DirectorSection";
import { HomeSwitch } from "@/components/dashboard/HomeSwitch";
import PersonalHome from "@/components/dashboard/PersonalHome";
import { getDashboardOptions, type DashboardOption } from "@/lib/roles";

function Home({ roles }: { roles: string[] }) {
  const dashboardOptions = getDashboardOptions(roles);
  const [view, setView] = useState<DashboardOption>(() => {
    const stored = typeof window === "undefined" ? null : (localStorage.getItem("meraki-dashboard-preference") as DashboardOption | null);
    return stored && dashboardOptions.includes(stored) ? stored : (dashboardOptions[0] ?? "personal");
  });
  // On phones people with both views get a Business / My day switch (hidden from md up).
  const switcher = dashboardOptions.length > 1 ? <HomeSwitch view={view} onChange={setView} /> : undefined;
  return view === "director" ? <DirectorSection switcher={switcher} /> : <PersonalHome switcher={switcher} />;
}

/** Home: director overview or personal view, per the role-eligible preference saved in the profile. */
export default function DashboardPage() {
  const { data: roles } = usePermissions<string[]>({});
  // Wait for roles so the wrong view (and its queries) never mounts first.
  if (!roles) return null;
  return <Home roles={roles} />;
}
