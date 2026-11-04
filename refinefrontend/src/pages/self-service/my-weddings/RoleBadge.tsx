import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, type MyWedding } from "@/hooks/useMyWeddings";

const ROLE_VARIANT = { lead: "default", support: "info", assistant: "secondary" } as const;

/** The viewer's role on a wedding. */
export function RoleBadge({ role }: { role: MyWedding["my_role"] }) {
  return <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>;
}
