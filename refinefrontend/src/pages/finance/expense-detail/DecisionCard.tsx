import { useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailCard } from "../DetailCard";
import { responseError } from "../expenses/types";

type Decision = "approve" | "reject";

/** Approve / reject a pending expense through the existing endpoints (POST /inquiry-api/expense/{name}/approve|reject). */
export function DecisionCard({ piName }: { piName: string }) {
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<Decision | null>(null);
  // Set after a successful decision and never cleared: the card disappears once the refetch shows the new status.
  const [decided, setDecided] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const decidedRef = useRef(false);

  async function decide(kind: Decision) {
    if (inFlight.current) return;
    if (!confirm(kind === "approve" ? `Approve ${piName}? It will be submitted and marked paid.` : `Reject ${piName}?`)) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/inquiry-api/expense/${encodeURIComponent(piName)}/${kind}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw await responseError(res, kind === "approve" ? "Failed to approve" : "Failed to reject");
      decidedRef.current = true;
      setDecided(true);
      await invalidate({ resource: "Purchase Invoice", invalidates: ["list", "detail"], id: piName });
    } catch (err) {
      console.error("Expense decision failed", kind, piName, err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      // After a success the buttons stay locked (decided) until the card hides; only failures re-enable them.
      if (!decidedRef.current) inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <DetailCard title="Finance decision" className="border-warning-soft-foreground/25 bg-warning-soft/30">
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="success" disabled={busy !== null || decided} onClick={() => void decide("approve")} className="px-6">
          {busy === "approve" ? "Approving..." : "Approve"}
        </Button>
        <Button variant="outline" disabled={busy !== null || decided} onClick={() => void decide("reject")}
          className="border-danger-soft-foreground/30 px-6 text-destructive hover:text-destructive">
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
    </DetailCard>
  );
}
