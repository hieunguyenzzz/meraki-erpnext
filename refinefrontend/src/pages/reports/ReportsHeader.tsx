import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/reports/leaves", label: "Leave report" },
  { to: "/reports/expenses", label: "Wedding expenses" },
] as const;

/** Shared Reports title and tabs (D-Reports.dc.html). Each tab is its own route. */
export function ReportsHeader() {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Reports</h1>
      <nav aria-label="Reports" className="flex gap-7 border-b">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                "-mb-px inline-flex h-12 items-center border-b-2 text-[15px] font-semibold md:h-11",
                isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
