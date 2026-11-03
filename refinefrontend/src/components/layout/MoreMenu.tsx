import { Link } from "react-router";
import { useGetIdentity, useLogout, usePermissions } from "@refinedev/core";
import { ChevronRight, LogOut } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import {
  PRIMARY_ROLE_LABEL, getBottomBar, getMoreSections, getPrimaryRole, type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const;

// Cycled so neighbouring tiles read differently, all from the status tokens.
const TILE_TONES = [
  "bg-accent text-accent-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-success-soft text-success-soft-foreground",
  "bg-info-soft text-info-soft-foreground",
];

function Tile({ item, tone }: { item: NavItem; tone: string }) {
  return (
    <Link
      to={item.path}
      className="flex min-h-[88px] flex-col items-start justify-between gap-2.5 rounded-card border bg-card p-3.5 text-sm font-semibold"
    >
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-[10px]", tone)}>
        <item.icon className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
      </span>
      {item.label}
    </Link>
  );
}

/** Mobile "More" page (M-More.dc.html): everything not in the bottom bar, plus appearance and sign out. */
export function MoreMenu() {
  const { data } = usePermissions<string[]>({});
  const roles = data ?? [];
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const { employee } = useMyEmployee();
  const { theme, setTheme } = useTheme();
  const { mutate: logout } = useLogout({});

  const sections = getMoreSections(roles, getBottomBar(roles));
  const name = employee?.employee_name ?? identity?.name ?? identity?.email ?? "";
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-[18px]">
      <Link to="/my-profile" className="flex items-center gap-3.5 p-1">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
          {initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[19px]">{name}</b>
          <span className="text-sm text-muted-foreground">
            {PRIMARY_ROLE_LABEL[getPrimaryRole(roles)]} · View profile
          </span>
        </span>
        <ChevronRight className="h-[22px] w-[22px] text-muted-foreground" aria-hidden />
      </Link>

      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[.06em] text-muted-foreground">{s.title}</h2>
          <div className="grid grid-cols-3 gap-2.5">
            {s.items.map((item, i) => (
              <Tile key={item.path} item={item} tone={TILE_TONES[i % TILE_TONES.length]} />
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-2.5">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-[.06em] text-muted-foreground">App</h2>
        <div className="overflow-hidden rounded-card border bg-card">
          <div className="flex min-h-[52px] items-center justify-between px-4 text-[15px]">
            <span>Appearance</span>
            <div role="radiogroup" aria-label="Appearance" className="flex gap-0.5 rounded-full bg-muted p-[3px]">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "h-9 rounded-full px-3 text-[13px]",
                    theme === t.value ? "bg-card font-semibold shadow-sm" : "text-foreground/80"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="flex min-h-[52px] w-full items-center gap-3 border-t px-4 text-[15px] text-destructive"
          >
            <LogOut className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
