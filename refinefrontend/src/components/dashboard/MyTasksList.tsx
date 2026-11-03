import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyTask } from "@/hooks/useMyTasks";

const SHOWN = 5;

/** Soonest-due open tasks (overdue first). Read-only; completing a task happens on the wedding. */
export function MyTasksList({ tasks, isLoading }: { tasks: MyTask[]; isLoading: boolean }) {
  if (!isLoading && tasks.length === 0) return null;
  const today = new Date().toLocaleDateString("sv-SE");
  return (
    <section aria-label="My tasks" className="space-y-1">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h2 className="text-[17px] font-semibold">My tasks</h2>
        {!isLoading && <Link to="/projects" className="text-sm font-semibold text-primary hover:underline">All {tasks.length}</Link>}
      </div>
      {isLoading ? (
        [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-card" />)
      ) : (
        tasks.slice(0, SHOWN).map((t) => {
          const overdue = !!t.exp_end_date && t.exp_end_date < today;
          return (
            <div key={t.name} className="flex min-h-14 flex-col justify-center rounded-card border bg-card px-3.5 py-2">
              <span className="text-[15px]">{t.subject}</span>
              <span className="text-xs text-muted-foreground">
                {t.project && t.project_name && (
                  <Link to={`/projects/${t.project}`} className="hover:text-primary">{t.project_name}</Link>
                )}
                {t.project_name && t.exp_end_date ? " · " : ""}
                {t.exp_end_date && (
                  <span className={overdue ? "font-semibold text-destructive" : undefined}>
                    {overdue ? "overdue " : "due "}
                    <span className="tabular-nums">{t.exp_end_date}</span>
                  </span>
                )}
              </span>
            </div>
          );
        })
      )}
    </section>
  );
}
