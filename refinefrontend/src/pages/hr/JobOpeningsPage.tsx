import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useList, useCreate, useUpdate, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Briefcase, CalendarDays, Check, Copy, List, Plus } from "lucide-react";
import { formatDate } from "@/lib/format";

interface JobOpening {
  name: string;
  job_title: string;
  status: string;
  location: string;
  closes_on: string;
  custom_application_level: string;
  designation: string;
}

const LEVEL_VARIANT: Record<string, "info" | "default" | "warning"> = {
  Intern: "info",
  Standard: "default",
  Senior: "warning",
};

const STATUS_VARIANT: Record<string, "success" | "secondary"> = {
  Open: "success",
  Closed: "secondary",
};

interface NewPositionForm {
  job_title: string;
  designation: string;
  custom_application_level: string;
  location: string;
  closes_on: string;
  description: string;
}

const INITIAL_FORM: NewPositionForm = {
  job_title: "",
  designation: "",
  custom_application_level: "Standard",
  location: "",
  closes_on: "",
  description: "",
};

function CopyLinkButton({ jobName }: { jobName: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url =
      window.location.origin + "/apply?job=" + encodeURIComponent(jobName);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 mr-1 text-green-600" />
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 mr-1" />
          Link
        </>
      )}
    </Button>
  );
}

export default function JobOpeningsPage() {
  const invalidate = useInvalidate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewPositionForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const { mutateAsync: createJob } = useCreate();
  const { mutate: updateJob } = useUpdate();

  const { result, query } = useList<JobOpening>({
    resource: "Job Opening",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name",
        "job_title",
        "status",
        "location",
        "closes_on",
        "custom_application_level",
        "designation",
      ],
    },
  });

  const jobs = useMemo(
    () => (result?.data ?? []) as JobOpening[],
    [result]
  );

  function handleToggleStatus(row: JobOpening) {
    const newStatus = row.status === "Open" ? "Closed" : "Open";
    updateJob(
      {
        resource: "Job Opening",
        id: row.name,
        values: { status: newStatus },
      },
      {
        onSuccess: () => {
          invalidate({ resource: "Job Opening", invalidates: ["list"] });
        },
      }
    );
  }

  const columns: ColumnDef<JobOpening, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "job_title",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Job Title" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.job_title}</span>
        ),
      },
      {
        accessorKey: "custom_application_level",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Level" />
        ),
        cell: ({ row }) => {
          const level = row.original.custom_application_level || "Standard";
          return (
            <Badge variant={LEVEL_VARIANT[level] ?? "default"}>{level}</Badge>
          );
        },
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.original.status || "Open";
          return (
            <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
              {status}
            </Badge>
          );
        },
      },
      {
        accessorKey: "location",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Location" />
        ),
        cell: ({ row }) => row.original.location || "-",
      },
      {
        accessorKey: "closes_on",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Closes On" />
        ),
        cell: ({ row }) =>
          row.original.closes_on ? formatDate(row.original.closes_on) : "-",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <CopyLinkButton jobName={row.original.name} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => handleToggleStatus(row.original)}
            >
              {row.original.status === "Open" ? "Close" : "Reopen"}
            </Button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.job_title.trim()) {
      setFormError("Job title is required.");
      return;
    }
    if (!form.custom_application_level) {
      setFormError("Application level is required.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      await createJob({
        resource: "Job Opening",
        values: {
          job_title: form.job_title.trim(),
          designation: form.designation.trim() || undefined,
          custom_application_level: form.custom_application_level,
          location: form.location.trim() || undefined,
          closes_on: form.closes_on || undefined,
          description: form.description.trim() || undefined,
          status: "Open",
        },
      });
      invalidate({ resource: "Job Opening", invalidates: ["list"] });
      setDialogOpen(false);
      setForm(INITIAL_FORM);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create job opening."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Openings</h1>
          <p className="text-muted-foreground">
            Manage open positions and share application links
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/hr/recruiting/pipeline"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Pipeline
          </Link>
          <Link
            to="/hr/recruiting/all"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <List className="h-4 w-4" /> All Applicants
          </Link>
          <Link
            to="/hr/recruiting/interviews"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <CalendarDays className="h-4 w-4" /> Interviews
          </Link>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Position
          </Button>
        </div>
      </div>

      {/* Active tab indicator */}
      <div className="flex items-center gap-1 border-b">
        <Link
          to="/hr/recruiting/pipeline"
          className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Pipeline
        </Link>
        <Link
          to="/hr/recruiting/all"
          className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          All Applicants
        </Link>
        <Link
          to="/hr/recruiting/interviews"
          className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Interviews
        </Link>
        <span className="px-3 py-2 text-sm font-medium border-b-2 border-primary text-primary">
          Jobs
        </span>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={jobs}
        isLoading={isLoading}
        searchKey="job_title"
        searchPlaceholder="Search positions..."
      />

      {/* New Position Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              New Position
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Job Title */}
            <div className="space-y-1.5">
              <Label htmlFor="job_title">
                Job Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="job_title"
                value={form.job_title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, job_title: e.target.value }))
                }
                placeholder="e.g. Event Coordinator"
                required
              />
            </div>

            {/* Designation */}
            <div className="space-y-1.5">
              <Label htmlFor="designation">Designation</Label>
              <Input
                id="designation"
                value={form.designation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, designation: e.target.value }))
                }
                placeholder="e.g. Coordinator"
              />
            </div>

            {/* Application Level */}
            <div className="space-y-1.5">
              <Label>
                Application Level <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.custom_application_level}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, custom_application_level: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Intern">Intern</SelectItem>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Senior">Senior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                placeholder="e.g. Ho Chi Minh City"
              />
            </div>

            {/* Closes On */}
            <div className="space-y-1.5">
              <Label htmlFor="closes_on">Closes On</Label>
              <Input
                id="closes_on"
                type="date"
                value={form.closes_on}
                onChange={(e) =>
                  setForm((f) => ({ ...f, closes_on: e.target.value }))
                }
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Role overview, responsibilities..."
                rows={3}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setForm(INITIAL_FORM);
                  setFormError("");
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Position"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
