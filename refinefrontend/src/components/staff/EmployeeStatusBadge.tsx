import { Badge } from "@/components/ui/badge";

const VARIANT = {
  Active: "success",
  Inactive: "secondary",
  Suspended: "warning",
  Left: "destructive",
} as const;

export function EmployeeStatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT[status as keyof typeof VARIANT] ?? "secondary"}>{status}</Badge>;
}
