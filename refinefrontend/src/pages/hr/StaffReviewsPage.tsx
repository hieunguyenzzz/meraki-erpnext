import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useList, useInvalidate } from "@refinedev/core";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { SegmentedRating } from "@/components/staff-review/SegmentedRating";
import { CreateReviewSheet } from "@/components/staff-review/CreateReviewSheet";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/format";

interface MerakiReview {
  name: string;
  employee: string;
  employee_name?: string;
  review_date: string;
  period?: string;
  average_rating?: number;
  overall_score?: number;
  reviewer?: string;
  creation?: string;
}

export default function StaffReviewsPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { result, query } = useList<MerakiReview>({
    resource: "Meraki Review",
    pagination: { pageSize: 50 },
    sorters: [{ field: "review_date", order: "desc" }],
    meta: {
      fields: [
        "name",
        "employee",
        "employee_name",
        "review_date",
        "period",
        "average_rating",
        "overall_score",
        "reviewer",
        "creation",
      ],
    },
  });

  const reviews = useMemo(() => (result?.data ?? []) as MerakiReview[], [result]);
  const isLoading = query.isLoading;

  const columns: ColumnDef<MerakiReview, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "employee_name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium text-left hover:underline focus-visible:underline"
            onClick={() => navigate(`/hr/staff-reviews/${encodeURIComponent(row.original.name)}`)}
          >
            {row.original.employee_name || row.original.employee}
          </button>
        ),
      },
      {
        accessorKey: "review_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => formatDate(row.original.review_date),
      },
      {
        accessorKey: "period",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Period" />,
        cell: ({ row }) => row.original.period || "—",
      },
      {
        id: "score",
        header: "Score",
        cell: ({ row }) => {
          const override = row.original.overall_score;
          const avg = row.original.average_rating;
          // Treat 0 as "not set" for both fields
          const raw = (override && override > 0) ? override : (avg && avg > 0) ? avg : null;
          const score = raw !== null ? Math.round(raw) : null;
          return (
            <div className="w-32">
              <SegmentedRating value={score} readOnly size="sm" />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "reviewer",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Reviewer" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.reviewer || "—"}</span>
        ),
      },
      {
        accessorKey: "creation",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row }) => formatDate(row.original.creation),
      },
    ],
    [navigate]
  );

  function handleCreated() {
    setSheetOpen(false);
    invalidate({ resource: "Meraki Review", invalidates: ["list"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Reviews</h1>
          <p className="text-muted-foreground">Performance review records for all staff</p>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Review
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={reviews}
        isLoading={isLoading}
        searchKey="employee_name"
        searchPlaceholder="Search by employee..."
      />

      <CreateReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
