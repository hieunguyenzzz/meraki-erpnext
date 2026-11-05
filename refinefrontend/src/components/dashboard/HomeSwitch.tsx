import { cn } from "@/lib/utils";

export type HomeView = "director" | "personal";

const TABS: { id: HomeView; label: string }[] = [
  { id: "director", label: "Business" },
  { id: "personal", label: "My day" },
];

/** Phone-only segmented switch for people who have both the Business overview and a personal Home. */
export function HomeSwitch({ view, onChange }: { view: HomeView; onChange: (v: HomeView) => void }) {
  return (
    <div role="tablist" aria-label="Home view" className="flex rounded-full bg-muted p-[3px] md:hidden">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={view === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "h-9 flex-1 rounded-full text-sm transition-colors",
            view === t.id ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
