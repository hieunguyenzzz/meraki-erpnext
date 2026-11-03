import { Fragment } from "react";
import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypeBadge } from "../weddings-list/WeddingBadges";
import { dayLabel } from "./range";
import { EventTypeBadge, StaffAvatars, coupleName, eventTime, venueText } from "./eventParts";
import type { DayGroup } from "./groupByDay";

const HEAD = "h-11 whitespace-nowrap bg-secondary px-4 text-[13px]";

function Head() {
  return (
    <TableHeader>
      <TableRow className="hover:bg-secondary">
        <TableHead className={HEAD}>Time</TableHead>
        <TableHead className={HEAD}>Type</TableHead>
        <TableHead className={HEAD}>Wedding</TableHead>
        <TableHead className={HEAD}>Venue</TableHead>
        <TableHead className={`${HEAD} text-right`}>Guests</TableHead>
        <TableHead className={HEAD}>Staff</TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** Desktop agenda: one table, a shaded row per day, events in time order. */
export function EventsTable({ groups }: { groups: DayGroup[] }) {
  return (
    <section className="overflow-hidden rounded-card border bg-card">
      <div className="overflow-x-auto">
        <Table className="min-w-[820px]">
          <Head />
          <TableBody>
            {groups.map((g) => {
              const label = dayLabel(g.date);
              return (
                <Fragment key={g.date}>
                  <TableRow className="hover:bg-secondary/60">
                    <TableCell colSpan={6} className="bg-secondary/60 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {label.main}
                      {label.date && <span className="ml-2 font-medium normal-case tracking-normal">{label.date}</span>}
                    </TableCell>
                  </TableRow>
                  {g.events.map((e) => (
                    <TableRow key={e.name}>
                      <TableCell className="whitespace-nowrap px-4 py-3 tabular-nums">{eventTime(e)}</TableCell>
                      <TableCell className="px-4 py-3"><EventTypeBadge type={e.event_type} /></TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/projects/${e.project}`} className="font-semibold text-primary hover:underline">
                            {coupleName(e)}
                          </Link>
                          {e.wedding_type && <TypeBadge type={e.wedding_type} />}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">{venueText(e) || <span className="text-muted-foreground">{"—"}</span>}</TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        {e.guest_count ?? <span className="text-muted-foreground">{"—"}</span>}
                      </TableCell>
                      <TableCell className="px-4 py-3"><StaffAvatars staff={e.staff} /></TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function EventsTableSkeleton() {
  return (
    <section className="overflow-hidden rounded-card border bg-card" aria-busy="true">
      <div className="h-11 bg-secondary" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-t px-4 py-3.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </section>
  );
}
