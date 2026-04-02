import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";

interface WfhRequest {
  name: string;
  employee: string;
  employee_name: string;
  from_date: string;
  to_date: string;
  explanation: string;
  docstatus: number;
}

function statusLabel(docstatus: number): string {
  switch (docstatus) {
    case 0: return "Pending";
    case 1: return "Approved";
    case 2: return "Cancelled";
    default: return "Unknown";
  }
}

function statusVariant(docstatus: number) {
  switch (docstatus) {
    case 0: return "secondary" as const;
    case 1: return "success" as const;
    case 2: return "destructive" as const;
    default: return "secondary" as const;
  }
}

function calcDays(from_date: string, to_date: string): number {
  const f = new Date(from_date + "T00:00:00");
  const t = new Date(to_date + "T00:00:00");
  return Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
}

export default function WfhPage() {
  const [requests, setRequests] = useState<WfhRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  async function fetchRequests() {
    try {
      const res = await fetch("/inquiry-api/wfh/list-all");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setRequests(json.data ?? []);
    } catch {
      setError("Failed to load WFH requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleAction(name: string, action: "approve" | "reject") {
    setProcessingId(name);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/wfh/${encodeURIComponent(name)}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await fetchRequests();
    } catch {
      setError(`Failed to ${action} ${name}`);
    } finally {
      setProcessingId(null);
    }
  }

  const filtered = filter === "pending"
    ? requests.filter((r) => r.docstatus === 0)
    : requests;

  const pendingCount = requests.filter((r) => r.docstatus === 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WFH Requests</h1>
        <p className="text-muted-foreground">Manage work from home requests</p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium hover:text-red-900">&times;</button>
        </div>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as "pending" | "all")}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending{pendingCount > 0 && ` (${pendingCount})`}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No WFH requests found</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Employee</th>
                <th className="px-4 py-3 text-left font-medium">From</th>
                <th className="px-4 py-3 text-left font-medium">To</th>
                <th className="px-4 py-3 text-right font-medium">Days</th>
                <th className="px-4 py-3 text-left font-medium">Notes</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => (
                <tr key={req.name} className="border-b">
                  <td className="px-4 py-3 font-medium">{req.employee_name}</td>
                  <td className="px-4 py-3">{formatDate(req.from_date)}</td>
                  <td className="px-4 py-3">{formatDate(req.to_date)}</td>
                  <td className="px-4 py-3 text-right">{calcDays(req.from_date, req.to_date)}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground">{req.explanation || "\u2014"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(req.docstatus)}>{statusLabel(req.docstatus)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {req.docstatus === 0 && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(req.name, "approve")}
                          disabled={processingId === req.name}
                        >
                          {processingId === req.name ? "..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(req.name, "reject")}
                          disabled={processingId === req.name}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
