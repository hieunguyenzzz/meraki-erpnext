import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { ArrowLeft, ArrowRight, CalendarDays, Star, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { extractErrorMessage } from "@/lib/errors";

interface Applicant {
  name: string;
  applicant_name: string;
  email_id: string;
  phone_number: string;
  job_title: string;
  custom_recruiting_stage: string;
  source: string;
  creation: string;
  applicant_rating: number;
  custom_city: string;
  country: string;
}

const STAGE_VARIANT: Record<string, "secondary" | "warning" | "info" | "default" | "success" | "destructive"> = {
  Applied: "secondary",
  Screening: "warning",
  Interview: "info",
  Offer: "default",
  Hired: "success",
  Rejected: "destructive",
};

/** Convert ERPNext fractional rating (0–1) to integer stars (0–5) */
function ratingToStars(fraction: number): number {
  return Math.round((fraction ?? 0) * 5);
}

function RatingStars({ value }: { value: number }) {
  const stars = ratingToStars(value);
  if (!stars) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

export default function ApplicantsListPage() {
  const invalidate = useInvalidate();
  const { mutateAsync: customMutation } = useCustomMutation();

  // Filters
  const [minRating, setMinRating] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  // Row selection
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);

  // Data fetching
  const { result, query } = useList({
    resource: "Job Applicant",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    meta: {
      fields: [
        "name", "applicant_name", "email_id", "phone_number",
        "job_title", "custom_recruiting_stage", "source", "creation",
        "applicant_rating", "custom_city", "country",
      ],
    },
  });

  const { result: jobOpeningsResult } = useList({
    resource: "Job Opening",
    pagination: { mode: "off" },
    meta: { fields: ["name", "job_title"] },
  });

  const { result: sourcesResult } = useList({
    resource: "Job Applicant Source",
    pagination: { mode: "off" },
    meta: { fields: ["name"] },
  });

  const jobOpenings = (jobOpeningsResult?.data ?? []) as { name: string; job_title: string }[];
  const sources = (sourcesResult?.data ?? []) as { name: string }[];

  // Map job_title (link) -> readable title
  const joMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const jo of jobOpenings) m.set(jo.name, jo.job_title);
    return m;
  }, [jobOpenings]);

  // Enrich + filter applicants
  const applicants = useMemo(() => {
    const raw = (result?.data ?? []) as Applicant[];
    let list = raw.map((a) => ({
      ...a,
      job_title: joMap.get(a.job_title) || a.job_title || "",
      applicant_rating: a.applicant_rating ?? 0,
      custom_city: a.custom_city ?? "",
      country: a.country ?? "",
    }));

    if (minRating > 0) {
      list = list.filter((a) => ratingToStars(a.applicant_rating) >= minRating);
    }
    if (sourceFilter) {
      list = list.filter((a) => a.source === sourceFilter);
    }
    if (positionFilter) {
      list = list.filter((a) => {
        // Match against the original job_title link field or the resolved title
        const original = (result?.data as Applicant[])?.find((r) => r.name === a.name);
        return original?.job_title === positionFilter || a.job_title === joMap.get(positionFilter);
      });
    }
    if (cityFilter) {
      const q = cityFilter.toLowerCase();
      list = list.filter((a) => a.custom_city.toLowerCase().includes(q));
    }

    return list;
  }, [result, joMap, minRating, sourceFilter, positionFilter, cityFilter]);

  const hasFilters = minRating > 0 || sourceFilter || positionFilter || cityFilter;
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedCount = selectedIds.length;

  // Columns
  const columns: ColumnDef<Applicant, unknown>[] = useMemo(() => [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-muted-foreground/50"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-muted-foreground/50"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: "applicant_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <Link
          to={`/hr/recruiting/${row.original.name}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.applicant_name || row.original.name}
        </Link>
      ),
      filterFn: "includesString",
    },
    {
      id: "position",
      accessorKey: "job_title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Position" />,
      cell: ({ row }) => row.getValue("position") || "-",
    },
    {
      accessorKey: "custom_recruiting_stage",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stage" />,
      cell: ({ row }) => {
        const stage = row.original.custom_recruiting_stage || "Applied";
        return <Badge variant={STAGE_VARIANT[stage] ?? "secondary"}>{stage}</Badge>;
      },
      filterFn: "arrIncludesSome",
    },
    {
      accessorKey: "source",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => row.original.source || "-",
    },
    {
      accessorKey: "creation",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Applied" />,
      cell: ({ row }) => formatDate(row.original.creation),
    },
    {
      accessorKey: "applicant_rating",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rating" />,
      cell: ({ row }) => <RatingStars value={row.original.applicant_rating} />,
    },
  ], []);

  // Send to Scanner handler
  const handleSendToScanner = async () => {
    setIsSending(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          customMutation({
            url: "/api/method/frappe.client.set_value",
            method: "post",
            values: {
              doctype: "Job Applicant",
              name: id,
              fieldname: "custom_recruiting_stage",
              value: "Applied",
            },
          })
        )
      );
      invalidate({ resource: "Job Applicant", invalidates: ["list"] });
      setRowSelection({});
    } catch (err) {
      console.error(extractErrorMessage(err, "Failed to send to scanner"));
    } finally {
      setIsSending(false);
    }
  };

  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Applicants</h1>
          <p className="text-muted-foreground">Every applicant across all stages</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/hr/recruiting"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> CV Scanner
          </Link>
          <Link
            to="/hr/recruiting/pipeline"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Pipeline <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/hr/recruiting/interviews"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <CalendarDays className="h-4 w-4" /> Interviews
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Min Rating */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Min rating:</span>
          <span className="inline-flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="focus:outline-none"
                onClick={() => setMinRating(minRating === star ? 0 : star)}
              >
                <Star
                  className={`h-4 w-4 transition-colors ${
                    star <= minRating
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40 hover:text-amber-300"
                  }`}
                />
              </button>
            ))}
          </span>
        </div>

        {/* Source */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>

        {/* Position */}
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All positions</option>
          {jobOpenings.map((jo) => (
            <option key={jo.name} value={jo.name}>{jo.job_title}</option>
          ))}
        </select>

        {/* City */}
        <Input
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          placeholder="City..."
          className="h-8 w-36"
        />

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              setMinRating(0);
              setSourceFilter("");
              setPositionFilter("");
              setCityFilter("");
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={applicants}
        isLoading={isLoading}
        searchKey="applicant_name"
        searchPlaceholder="Search applicants..."
        filterableColumns={[
          {
            id: "custom_recruiting_stage",
            title: "Stage",
            options: [
              { label: "Applied", value: "Applied" },
              { label: "Screening", value: "Screening" },
              { label: "Interview", value: "Interview" },
              { label: "Offer", value: "Offer" },
              { label: "Hired", value: "Hired" },
              { label: "Rejected", value: "Rejected" },
            ],
          },
        ]}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.name}
      />

      {/* Floating action bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <Button
            size="sm"
            onClick={handleSendToScanner}
            disabled={isSending}
          >
            {isSending ? "Sending..." : "Send to Scanner"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRowSelection({})}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
