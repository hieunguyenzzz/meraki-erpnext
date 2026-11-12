import { useState } from "react";
import { Clock, Plus, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/wedding/SectionCard";
import { formatDate } from "@/lib/format";
import { stageBadgeVariant } from "./constants";
import { CreateTaskSheet } from "./CreateTaskSheet";
import type { WeddingData } from "./useWeddingData";

export function TasksTab({ w }: { w: WeddingData }) {
  const { tasks, employees } = w;
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  function getAssigneeFromTask(task: any) {
    try {
      const assignedUsers = JSON.parse(task._assign || "[]");
      if (assignedUsers.length === 0) return null;
      const userId = assignedUsers[0];
      const employee = employees.find((e) => e.userId === userId);
      return employee?.name || userId;
    } catch {
      return null;
    }
  }

  function getSharedWithFromTask(task: any) {
    if (!task.custom_shared_with) return [];
    const ids = task.custom_shared_with.split(",").filter(Boolean);
    return ids.map((id: string) => employees.find((e) => e.id === id.trim())?.name || id).filter(Boolean);
  }

  return (
    <SectionCard
      title="Project tasks"
      action={
        <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      }
    >
      <CreateTaskSheet w={w} open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet. Click "Add Task" to create your first task.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: any) => {
            const assignee = getAssigneeFromTask(task);
            const sharedWithNames = getSharedWithFromTask(task);
            return (
              <div key={task.name} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-medium">{task.subject}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {task.exp_end_date && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(task.exp_end_date)}
                      </span>
                    )}
                    {assignee && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {assignee}
                      </span>
                    )}
                    {sharedWithNames.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />+{sharedWithNames.length} shared
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {task.custom_wedding_phase && (
                    <Badge variant={stageBadgeVariant(task.custom_wedding_phase)} className="text-[10px]">{task.custom_wedding_phase}</Badge>
                  )}
                  {task.priority && (
                    <Badge
                      variant={task.priority === "High" || task.priority === "Urgent" ? "destructive" : task.priority === "Medium" ? "warning" : "secondary"}
                      className="text-[10px]"
                    >
                      {task.priority}
                    </Badge>
                  )}
                  <Badge variant={task.status === "Completed" ? "success" : task.status === "Cancelled" ? "destructive" : "secondary"} className="text-[10px]">
                    {task.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
