import { useState } from "react";
import { Link } from "react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { setTaskDone, type HomeTask } from "@/hooks/useHomePlanner";

function dueLabel(t: HomeTask): { text: string; late: boolean } | null {
  if (t.due_in_days == null || !t.exp_end_date) return null;
  if (t.due_in_days < 0) {
    const n = -t.due_in_days;
    return { text: `overdue ${n} ${n === 1 ? "day" : "days"}`, late: true };
  }
  return { text: t.due_in_days === 0 ? "due today" : `due ${t.exp_end_date}`, late: false };
}

interface Props {
  tasks: HomeTask[];
  /** Open tasks in total (the list shows only the soonest few). */
  openCount: number;
  isLoading: boolean;
}

/** The caller's soonest open tasks. Ticking one completes it right away (it stays, struck through, until the next refresh). */
export function MyTasksList({ tasks, openCount, isLoading }: Props) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<string | null>(null);

  async function toggle(t: HomeTask, next: boolean) {
    setFailed(null);
    setDone((d) => ({ ...d, [t.name]: next }));
    try {
      await setTaskDone(t.name, next);
    } catch {
      setDone((d) => ({ ...d, [t.name]: !next }));
      setFailed(`Could not update "${t.subject}". Please try again.`);
    }
  }

  const stillOpen = openCount - Object.values(done).filter(Boolean).length;
  return (
    <section aria-label="My tasks" className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">My tasks</h2>
        {!isLoading && openCount > 0 && <Link to="/projects" className="text-sm font-semibold text-primary hover:underline">All {stillOpen}</Link>}
      </div>
      {failed && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{failed}</p>}
      {isLoading ? (
        [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
      ) : tasks.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No open tasks.</p>
      ) : (
        <div>
          {tasks.map((t, i) => {
            const isDone = !!done[t.name];
            const due = dueLabel(t);
            return (
              <label key={t.name} className={cn("flex min-h-[52px] cursor-pointer items-center gap-3 text-[15px]", i > 0 && "border-t")}>
                <Checkbox
                  checked={isDone}
                  onCheckedChange={(v) => toggle(t, v === true)}
                  aria-label={`Mark "${t.subject}" ${isDone ? "open" : "done"}`}
                  className="h-[22px] w-[22px] data-[state=checked]:border-success data-[state=checked]:bg-success"
                />
                <span className="min-w-0 flex-1">
                  <span className={cn(isDone && "text-muted-foreground line-through")}>{t.subject}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.project && t.project_name && (
                      <Link to={`/projects/${t.project}`} className="hover:text-primary">{t.project_name}</Link>
                    )}
                    {t.project_name && due ? " · " : ""}
                    {due && <span className={due.late ? "text-warning-soft-foreground" : undefined}>{due.text}</span>}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
