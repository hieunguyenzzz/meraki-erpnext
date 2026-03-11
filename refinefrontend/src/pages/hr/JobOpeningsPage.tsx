import { useState, useMemo } from "react";
import { useList, useCreate, useUpdate, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Briefcase, Check, Copy, Plus } from "lucide-react";
import { formatDate } from "@/lib/format";

interface JobOpening {
  name: string;
  job_title: string;
  status: string;
  location: string;
  closes_on: string;
  custom_application_level: string;
  designation: string;
  description: string;
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

interface PositionForm {
  job_title: string;
  designation: string;
  custom_application_level: string;
  location: string;
  closes_on: string;
  description: string;
}

const INITIAL_FORM: PositionForm = {
  job_title: "",
  designation: "",
  custom_application_level: "",
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobOpening | null>(null);
  const [form, setForm] = useState<PositionForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const { mutateAsync: createJob } = useCreate();
  const { mutateAsync: updateJob } = useUpdate();

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
        "description",
      ],
    },
  });

  const jobs = useMemo(
    () => (result?.data ?? []) as JobOpening[],
    [result]
  );

  function openCreate() {
    setEditingJob(null);
    setForm(INITIAL_FORM);
    setFormError("");
    setSheetOpen(true);
  }

  function openEdit(job: JobOpening) {
    setEditingJob(job);
    setForm({
      job_title: job.job_title ?? "",
      designation: job.designation ?? "",
      custom_application_level: job.custom_application_level ?? "",
      location: job.location ?? "",
      closes_on: job.closes_on ?? "",
      description: job.description ?? "",
    });
    setFormError("");
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setForm(INITIAL_FORM);
    setFormError("");
  }

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
          const level = row.original.custom_application_level;
          if (!level) return <span className="text-muted-foreground">—</span>;
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
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => openEdit(row.original)}
            >
              Edit
            </Button>
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
    setFormError("");
    setSubmitting(true);

    const level = form.custom_application_level === "__none__" ? "" : form.custom_application_level;

    const fields = {
      job_title: form.job_title.trim(),
      ...(form.designation.trim() && { designation: form.designation.trim() }),
      ...(level && { custom_application_level: level }),
      ...(form.location.trim() && { location: form.location.trim() }),
      ...(form.closes_on && { closes_on: form.closes_on }),
      ...(form.description.trim() && { description: form.description.trim() }),
    };

    try {
      if (editingJob) {
        await updateJob({
          resource: "Job Opening",
          id: editingJob.name,
          values: fields,
        });
      } else {
        await createJob({
          resource: "Job Opening",
          values: { ...fields, status: "Open" },
        });
      }
      invalidate({ resource: "Job Opening", invalidates: ["list"] });
      closeSheet();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save job opening."
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
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Position
        </Button>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={jobs}
        isLoading={isLoading}
        searchKey="job_title"
        searchPlaceholder="Search positions..."
      />

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent className="sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {editingJob ? "Edit Position" : "New Position"}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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

              {/* Designation + Location — two columns */}
              <div className="grid grid-cols-2 gap-3">
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
              </div>

              {/* Application Level — optional */}
              <div className="space-y-1.5">
                <Label>Application Level</Label>
                <Select
                  value={form.custom_application_level || "__none__"}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      custom_application_level: v === "__none__" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not specified (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not specified</SelectItem>
                    <SelectItem value="Intern">Intern</SelectItem>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Senior">Senior</SelectItem>
                  </SelectContent>
                </Select>
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
                  rows={5}
                />
              </div>

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
            </div>

            <SheetFooter className="px-6 py-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={closeSheet}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingJob ? "Save Changes" : "Create Position"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
