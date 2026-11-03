import { useState } from "react";
import { useInvalidate } from "@refinedev/core";
import * as Popover from "@radix-ui/react-popover";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PRIORITY_OPTIONS, WEDDING_PHASES } from "./constants";
import type { WeddingData } from "./useWeddingData";

interface Props {
  w: WeddingData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Panel for creating a task on this wedding (created through /inquiry-api/task/create). */
export function CreateTaskSheet({ w, open: createTaskOpen, onOpenChange: setCreateTaskOpen }: Props) {
  const { name, employees } = w;
  const invalidate = useInvalidate();
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ subject: "", phase: "", deadline: "", priority: "Medium", assignee: "" });
  const [sharedWith, setSharedWith] = useState<Set<string>>(new Set());

  function toggleSharedWith(employeeId: string) {
    setSharedWith((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }

  function resetTaskForm() {
    setTaskForm({
      subject: "",
      phase: "",
      deadline: "",
      priority: "Medium",
      assignee: "",
    });
    setSharedWith(new Set());
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.subject.trim() || !taskForm.phase || !taskForm.deadline) return;

    setIsSubmittingTask(true);
    try {
      const assigneeEmployee = employees.find((e) => e.id === taskForm.assignee);
      const assigneeUserId = assigneeEmployee?.userId;

      const resp = await fetch("/inquiry-api/task/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: name,
          subject: taskForm.subject.trim(),
          phase: taskForm.phase,
          deadline: taskForm.deadline,
          priority: taskForm.priority || "Medium",
          shared_with: Array.from(sharedWith).join(","),
          assignee_user_id: assigneeUserId || null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create task");
      }

      setCreateTaskOpen(false);
      resetTaskForm();
      invalidate({ resource: "Task", invalidates: ["list"] });
    } finally {
      setIsSubmittingTask(false);
    }
  }

  return (
        <Sheet open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
          <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
            <SheetHeader className="px-6 py-4 border-b shrink-0">
              <SheetTitle>Create Task</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleCreateTask} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task-subject">Subject *</Label>
                  <Input
                    id="task-subject"
                    placeholder="e.g. Send vendor contracts"
                    value={taskForm.subject}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, subject: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="task-phase">Phase *</Label>
                    <Select
                      value={taskForm.phase}
                      onValueChange={(value) =>
                        setTaskForm({ ...taskForm, phase: value })
                      }
                      required
                    >
                      <SelectTrigger id="task-phase">
                        <SelectValue placeholder="Select phase" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEDDING_PHASES.map((phase) => (
                          <SelectItem key={phase} value={phase}>
                            {phase}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-deadline">Deadline *</Label>
                    <Input
                      id="task-deadline"
                      type="date"
                      value={taskForm.deadline}
                      onChange={(e) =>
                        setTaskForm({ ...taskForm, deadline: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="task-assignee">Assign To</Label>
                    <Select
                      value={taskForm.assignee}
                      onValueChange={(value) =>
                        setTaskForm({ ...taskForm, assignee: value })
                      }
                    >
                      <SelectTrigger id="task-assignee">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-priority">Priority</Label>
                    <Select
                      value={taskForm.priority}
                      onValueChange={(value) =>
                        setTaskForm({ ...taskForm, priority: value })
                      }
                    >
                      <SelectTrigger id="task-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Share With</Label>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start"
                      >
                        {sharedWith.size > 0
                          ? `${sharedWith.size} employee(s) selected`
                          : "Select employees to share with..."}
                      </Button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-50 w-[260px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                        align="start"
                        sideOffset={4}
                      >
                        {employees
                          .filter((emp) => emp.id !== taskForm.assignee)
                          .map((emp) => {
                            const isSelected = sharedWith.has(emp.id);
                            return (
                              <button
                                type="button"
                                key={emp.id}
                                onClick={() => toggleSharedWith(emp.id)}
                                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                              >
                                <div
                                  className={cn(
                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                    isSelected
                                      ? "bg-primary text-primary-foreground"
                                      : "opacity-50"
                                  )}
                                >
                                  {isSelected && <Check className="h-4 w-4" />}
                                </div>
                                <span>{emp.name}</span>
                              </button>
                            );
                          })}
                        {sharedWith.size > 0 && (
                          <>
                            <div className="-mx-1 my-1 h-px bg-muted" />
                            <button
                              type="button"
                              onClick={() => setSharedWith(new Set())}
                              className="flex w-full cursor-default select-none items-center justify-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                            >
                              Clear all
                            </button>
                          </>
                        )}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                  <p className="text-xs text-muted-foreground">
                    Additional employees who can see this task
                  </p>
                </div>
              </div>
              <SheetFooter className="px-6 py-4 border-t shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateTaskOpen(false);
                    resetTaskForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isSubmittingTask ||
                    !taskForm.subject.trim() ||
                    !taskForm.phase ||
                    !taskForm.deadline
                  }
                >
                  {isSubmittingTask ? "Creating..." : "Create Task"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
  );
}
