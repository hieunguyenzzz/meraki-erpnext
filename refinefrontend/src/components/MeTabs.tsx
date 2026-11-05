import { Link } from "react-router";

export type MeTab = "profile" | "leave" | "wfh" | "payslips";

const TABS: { id: MeTab; label: string; to: string }[] = [
  { id: "profile", label: "Profile", to: "/my-profile" },
  { id: "leave", label: "Leave", to: "/my-leaves" },
  { id: "wfh", label: "Work from home", to: "/my-leaves?tab=wfh" },
  { id: "payslips", label: "Payslips", to: "/my-payroll" },
];

/** Section tabs under the "Me" title on desktop (D-MeLeave / D-MeWFH / D-MePayslips); phones use the bottom bar. */
export function MeTabs({ active }: { active: MeTab }) {
  return (
    <nav aria-label="Me sections" className="hidden gap-7 overflow-x-auto border-b md:flex">
      {TABS.map((t) => (
        <Link
          key={t.id}
          to={t.to}
          aria-current={active === t.id ? "page" : undefined}
          className={
            "flex h-11 items-center text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
            (active === t.id ? "text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]" : "text-muted-foreground hover:text-foreground")
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
