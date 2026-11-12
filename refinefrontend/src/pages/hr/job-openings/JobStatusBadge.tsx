import { Badge } from "@/components/ui/badge";

export function JobStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "Open" ? "success" : "secondary"}>{status}</Badge>;
}
