import { useState } from "react";
import { Link } from "react-router";
import { useGetIdentity, useLogout, useList, useCreate, useInvalidate } from "@refinedev/core";
import { LogOut, User, Calendar, Home } from "lucide-react";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialLeaveForm = {
  leave_type: "",
  from_date: "",
  to_date: "",
  description: "",
};

const initialWfhForm = {
  from_date: "",
  to_date: "",
  explanation: "",
};

export function UserNav() {
  const { data: identity } = useGetIdentity<{ email: string; name?: string }>();
  const { mutate: logout } = useLogout({});
  const { employeeId } = useMyEmployee();
  const { mutateAsync: createDoc } = useCreate();
  const invalidate = useInvalidate();

  // Dialog states
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [wfhDialogOpen, setWfhDialogOpen] = useState(false);

  // Form states
  const [leaveForm, setLeaveForm] = useState(initialLeaveForm);
  const [wfhForm, setWfhForm] = useState(initialWfhForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch leave types
  const { result: leaveTypesResult } = useList<{ name: string }>({
    resource: "Leave Type",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const leaveTypes = leaveTypesResult?.data ?? [];

  const email = identity?.email ?? "";
  const initials = email
    .split("@")[0]
    .split(/[._-]/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  function resetLeaveForm() {
    setLeaveForm(initialLeaveForm);
    setError(null);
    setSuccess(null);
  }

  function resetWfhForm() {
    setWfhForm(initialWfhForm);
    setError(null);
    setSuccess(null);
  }

  function handleLeaveDialogChange(open: boolean) {
    setLeaveDialogOpen(open);
    if (!open) resetLeaveForm();
  }

  function handleWfhDialogChange(open: boolean) {
    setWfhDialogOpen(open);
    if (!open) resetWfhForm();
  }

  async function handleLeaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !leaveForm.leave_type || !leaveForm.from_date || !leaveForm.to_date) {
      setError("Please fill in all required fields");
      return;
    }

    if (new Date(leaveForm.from_date) > new Date(leaveForm.to_date)) {
      setError("From date cannot be after To date");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await createDoc({
        resource: "Leave Application",
        values: {
          employee: employeeId,
          leave_type: leaveForm.leave_type,
          from_date: leaveForm.from_date,
          to_date: leaveForm.to_date,
          description: leaveForm.description,
          status: "Open",
        },
      });

      setSuccess("Leave request submitted successfully");
      invalidate({ resource: "Leave Application", invalidates: ["list"] });

      setTimeout(() => {
        setLeaveDialogOpen(false);
        resetLeaveForm();
      }, 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit leave request";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleWfhSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !wfhForm.from_date || !wfhForm.to_date) {
      setError("Please fill in all required fields");
      return;
    }

    if (new Date(wfhForm.from_date) > new Date(wfhForm.to_date)) {
      setError("From date cannot be after To date");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await createDoc({
        resource: "Attendance Request",
        values: {
          employee: employeeId,
          from_date: wfhForm.from_date,
          to_date: wfhForm.to_date,
          reason: "Work From Home",
          explanation: wfhForm.explanation,
        },
      });

      setSuccess("WFH request submitted successfully");
      invalidate({ resource: "Attendance Request", invalidates: ["list"] });

      setTimeout(() => {
        setWfhDialogOpen(false);
        resetWfhForm();
      }, 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit WFH request";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{identity?.name ?? email}</p>
              <p className="text-xs leading-none text-muted-foreground">{email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/my-profile">
              <User className="mr-2 h-4 w-4" />
              My Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLeaveDialogOpen(true)}>
            <Calendar className="mr-2 h-4 w-4" />
            Request Leave
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setWfhDialogOpen(true)}>
            <Home className="mr-2 h-4 w-4" />
            Request WFH
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Leave Request Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={handleLeaveDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
            <DialogDescription>
              Submit a new leave request for approval
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleLeaveSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {success}
              </div>
            )}

            <div>
              <Label htmlFor="leave_type">Leave Type *</Label>
              <Select
                value={leaveForm.leave_type}
                onValueChange={(v) => setLeaveForm((prev) => ({ ...prev, leave_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.name} value={lt.name}>
                      {lt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="leave_from_date">From Date *</Label>
                <Input
                  id="leave_from_date"
                  type="date"
                  value={leaveForm.from_date}
                  onChange={(e) =>
                    setLeaveForm((prev) => ({ ...prev, from_date: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="leave_to_date">To Date *</Label>
                <Input
                  id="leave_to_date"
                  type="date"
                  value={leaveForm.to_date}
                  onChange={(e) =>
                    setLeaveForm((prev) => ({ ...prev, to_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="leave_description">Reason</Label>
              <Textarea
                id="leave_description"
                value={leaveForm.description}
                onChange={(e) =>
                  setLeaveForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Optional: Describe the reason for your leave"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLeaveDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WFH Request Dialog */}
      <Dialog open={wfhDialogOpen} onOpenChange={handleWfhDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Work From Home</DialogTitle>
            <DialogDescription>
              Submit a request to work from home for approval
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleWfhSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {success}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="wfh_from_date">From Date *</Label>
                <Input
                  id="wfh_from_date"
                  type="date"
                  value={wfhForm.from_date}
                  onChange={(e) =>
                    setWfhForm((prev) => ({ ...prev, from_date: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="wfh_to_date">To Date *</Label>
                <Input
                  id="wfh_to_date"
                  type="date"
                  value={wfhForm.to_date}
                  onChange={(e) =>
                    setWfhForm((prev) => ({ ...prev, to_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="wfh_explanation">Notes</Label>
              <Textarea
                id="wfh_explanation"
                value={wfhForm.explanation}
                onChange={(e) =>
                  setWfhForm((prev) => ({ ...prev, explanation: e.target.value }))
                }
                placeholder="Optional: Add any notes or explanation"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setWfhDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
