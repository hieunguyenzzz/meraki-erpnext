import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard } from "@/components/wedding/SectionCard";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isoDate } from "./dates";
import type { ReviewRow } from "./types";

function participantsOf(raw: string | undefined): string[] {
  try {
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("Review participants are not valid JSON", raw, err);
    return [];
  }
}

export function ReviewTab({ employee, onSchedule }: { employee: string; onSchedule: () => void }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { result, query } = useList({
    resource: "Meraki Review",
    pagination: { mode: "off" },
    filters: [{ field: "employee", operator: "eq", value: employee }],
    sorters: [{ field: "review_date", order: "desc" }],
    meta: { fields: ["name", "review_date", "review_time", "notes", "participants", "google_event_id"] },
    queryOptions: { enabled: !!employee },
  });
  const reviews = useMemo(() => (result?.data ?? []) as unknown as ReviewRow[], [result]);

  return (
    <SectionCard title="Review history" action={<Button size="sm" onClick={onSchedule}>Schedule review</Button>}>
      {query.isError ? (
        <p role="alert" className="text-sm text-danger-soft-foreground">Could not load the review history.</p>
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet</p>
      ) : isDesktop ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Participants</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Calendar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r) => {
              const parts = participantsOf(r.participants);
              return (
                <TableRow key={r.name}>
                  <TableCell className="tabular-nums">{isoDate(r.review_date)}</TableCell>
                  <TableCell className="tabular-nums">{r.review_time ? r.review_time.slice(0, 5) : "-"}</TableCell>
                  <TableCell className="text-sm">{parts.length > 0 ? parts.join(", ") : "-"}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{r.notes || "-"}</TableCell>
                  <TableCell>
                    {r.google_event_id ? <span className="text-xs text-success-soft-foreground">Synced</span> : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <ul className="divide-y">
          {reviews.map((r) => {
            const parts = participantsOf(r.participants);
            return (
              <li key={r.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="tabular-nums">{isoDate(r.review_date)}{r.review_time && ` · ${r.review_time.slice(0, 5)}`}</span>
                  {r.google_event_id && <span className="text-xs text-success-soft-foreground">Synced to calendar</span>}
                </div>
                {parts.length > 0 && <p className="text-sm text-muted-foreground">{parts.join(", ")}</p>}
                {r.notes && <p className="text-sm">{r.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
