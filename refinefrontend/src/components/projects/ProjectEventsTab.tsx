import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Pencil, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { EVENT_TYPE_COLOR, formatTimeRange, type WeddingEvent } from "@/lib/weddingEvents";
import { ProjectEventDialog } from "./ProjectEventDialog";

interface ProjectEventsTabProps {
  projectId: string;
  venue?: string;
}

export function ProjectEventsTab({ projectId, venue }: ProjectEventsTabProps) {
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<WeddingEvent | undefined>(undefined);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const fetchEvents = useCallback(() => {
    setIsLoading(true);
    fetch(`/inquiry-api/wedding-events?project=${encodeURIComponent(projectId)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setEvents(data?.events ?? []))
      .catch(() => setError("Failed to load events"))
      .finally(() => setIsLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function handleAdd() {
    setEditingEvent(undefined);
    setDialogOpen(true);
  }

  function handleEdit(event: WeddingEvent) {
    setEditingEvent(event);
    setDialogOpen(true);
  }

  async function handleDelete(event: WeddingEvent) {
    if (!window.confirm(`Delete "${event.event_type}" on ${formatDate(event.event_date)}? This cannot be undone.`)) return;
    setDeletingName(event.name);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/wedding-events/${event.name}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to delete event");
      }
      fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event");
    } finally {
      setDeletingName(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Wedding Events</CardTitle>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Event
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="border rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Date / Time</th>
                <th className="px-3 py-2 text-left font-medium">Venue Area</th>
                <th className="px-3 py-2 text-right font-medium">Guests</th>
                <th className="px-3 py-2 text-left font-medium">Staff</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No events recorded yet
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.name} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={EVENT_TYPE_COLOR[event.event_type] ?? ""}>
                        {event.event_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div>{formatDate(event.event_date)}</div>
                      {(event.start_time || event.end_time) && (
                        <div className="text-xs text-muted-foreground">
                          {formatTimeRange(event.start_time, event.end_time)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{event.venue_area || "—"}</td>
                    <td className="px-3 py-2 text-right">{event.guest_count ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {event.staff.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          event.staff.map((s, i) => (
                            <Badge key={i} variant="secondary" title={s.role || undefined}>
                              {s.employee_name || s.employee}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(event)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(event)}
                          disabled={deletingName === event.name}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <ProjectEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        venue={venue}
        event={editingEvent}
        onSaved={fetchEvents}
      />
    </Card>
  );
}
