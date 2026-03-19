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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Briefcase, Check, ChevronsUpDown, Copy, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

interface JobOpening {
  name: string;
  job_title: string;
  status: string;
  location: string;
  closes_on: string;
  designation: string;
  description: string;
}

const STATUS_VARIANT: Record<string, "success" | "secondary"> = {
  Open: "success",
  Closed: "secondary",
};

interface PositionForm {
  designation: string;
  location: string;
  closes_on: string;
  description: string;
}

const INITIAL_FORM: PositionForm = {
  designation: "",
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
        "designation",
        "description",
      ],
    },
  });

  const jobs = useMemo(
    () => (result?.data ?? []) as JobOpening[],
    [result]
  );

  // Fetch existing locations and designations for combobox
  const { result: locationsResult, query: locationsQuery } = useList({
    resource: "Branch",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const branches = (locationsResult?.data ?? []) as any[];

  const { result: designationsResult, query: designationsQuery } = useList({
    resource: "Designation",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });
  const designations = (designationsResult?.data ?? []) as any[];

  // Combobox state
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);

  const [designationOpen, setDesignationOpen] = useState(false);
  const [designationSearch, setDesignationSearch] = useState("");
  const [creatingDesignation, setCreatingDesignation] = useState(false);

  const handleCreateLocation = async (name: string) => {
    setCreatingLocation(true);
    try {
      const resp = await fetch("/api/resource/Branch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": "erp.merakiwp.com" },
        credentials: "include",
        body: JSON.stringify({ branch: name }),
      });
      if (!resp.ok) throw new Error("Failed to create branch");
      const result = await resp.json();
      setForm((f) => ({ ...f, location: result?.data?.name ?? name }));
      setLocationOpen(false);
      setLocationSearch("");
      locationsQuery.refetch();
    } catch {
      setFormError("Failed to create branch.");
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleCreateDesignation = async (name: string) => {
    setCreatingDesignation(true);
    try {
      const resp = await fetch("/api/resource/Designation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Frappe-Site-Name": "erp.merakiwp.com" },
        credentials: "include",
        body: JSON.stringify({ designation: name }),
      });
      if (!resp.ok) throw new Error("Failed to create designation");
      const result = await resp.json();
      setForm((f) => ({ ...f, designation: result?.data?.name ?? name }));
      setDesignationOpen(false);
      setDesignationSearch("");
      designationsQuery.refetch();
    } catch {
      setFormError("Failed to create designation.");
    } finally {
      setCreatingDesignation(false);
    }
  };

  function openCreate() {
    setEditingJob(null);
    setForm(INITIAL_FORM);
    setFormError("");
    setSheetOpen(true);
  }

  function openEdit(job: JobOpening) {
    setEditingJob(job);
    setForm({
      designation: job.designation ?? "",
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
    if (!form.designation.trim()) {
      setFormError("Designation is required.");
      return;
    }
    setFormError("");
    setSubmitting(true);

    const fields = {
      job_title: form.designation.trim(),
      designation: form.designation.trim(),
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
              {/* Designation + Location — two columns */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>
                    Designation <span className="text-destructive">*</span>
                  </Label>
                  <Popover open={designationOpen} onOpenChange={setDesignationOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={designationOpen}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md border px-3 h-9 text-sm transition-colors",
                          "border-input bg-background hover:bg-accent focus:outline-none",
                          !form.designation && "text-muted-foreground"
                        )}
                      >
                        {form.designation || "Select designation..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search designations..."
                          value={designationSearch}
                          onValueChange={setDesignationSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No designations found.</CommandEmpty>
                          <CommandGroup>
                            {designations.map((d) => (
                              <CommandItem
                                key={d.name}
                                value={d.name}
                                onSelect={() => {
                                  setForm((f) => ({ ...f, designation: d.name }));
                                  setDesignationOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    form.designation === d.name ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {d.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          {designationSearch.length > 1 && !designations.some(
                            (d) => d.name.toLowerCase() === designationSearch.toLowerCase()
                          ) && (
                            <CommandGroup>
                              <CommandItem
                                value={`__create__${designationSearch}`}
                                onSelect={() => handleCreateDesignation(designationSearch)}
                                disabled={creatingDesignation}
                              >
                                {creatingDesignation ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="mr-2 h-4 w-4" />
                                )}
                                Create "{designationSearch}"
                              </CommandItem>
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Popover open={locationOpen} onOpenChange={setLocationOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={locationOpen}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md border px-3 h-9 text-sm transition-colors",
                          "border-input bg-background hover:bg-accent focus:outline-none",
                          !form.location && "text-muted-foreground"
                        )}
                      >
                        {form.location || "Select location..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search locations..."
                          value={locationSearch}
                          onValueChange={setLocationSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No branches found.</CommandEmpty>
                          <CommandGroup>
                            {branches.map((l) => (
                              <CommandItem
                                key={l.name}
                                value={l.name}
                                onSelect={() => {
                                  setForm((f) => ({ ...f, location: l.name }));
                                  setLocationOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    form.location === l.name ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {l.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          {locationSearch.length > 1 && !branches.some(
                            (l) => l.name.toLowerCase() === locationSearch.toLowerCase()
                          ) && (
                            <CommandGroup>
                              <CommandItem
                                value={`__create__${locationSearch}`}
                                onSelect={() => handleCreateLocation(locationSearch)}
                                disabled={creatingLocation}
                              >
                                {creatingLocation ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="mr-2 h-4 w-4" />
                                )}
                                Create "{locationSearch}"
                              </CommandItem>
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
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
