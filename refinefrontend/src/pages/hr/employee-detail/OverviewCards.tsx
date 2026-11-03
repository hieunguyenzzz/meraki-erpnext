import { Badge } from "@/components/ui/badge";
import { EditIconButton, FactList, SectionCard } from "@/components/wedding/SectionCard";
import { formatVND } from "@/lib/format";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import type { Employee } from "@/lib/types";
import { isoDate, tenureLabel } from "./dates";
import type { EditSection, UserOption } from "./types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

interface Props {
  employee: Employee;
  users: UserOption[];
  displayUserRoles: string[];
  onEdit: (section: EditSection) => void;
}

export function PersonalCard({ employee, onEdit }: Pick<Props, "employee" | "onEdit">) {
  const rows = [
    ...(employee.gender ? [{ label: "Gender", value: employee.gender }] : []),
    { label: "Date of birth", value: isoDate(employee.date_of_birth) },
  ];
  return (
    <SectionCard title="Personal" action={<EditIconButton label="Edit personal information" onClick={() => onEdit("personal")} />}>
      <FactList rows={rows} />
    </SectionCard>
  );
}

export function ContactCard({ employee, onEdit }: Pick<Props, "employee" | "onEdit">) {
  const rows = [
    { label: "Email", value: employee.company_email || "-" },
    ...(employee.user_id ? [{ label: "User account", value: employee.user_id }] : []),
  ];
  return (
    <SectionCard title="Contact" action={<EditIconButton label="Edit contact" onClick={() => onEdit("contact")} />}>
      <FactList rows={rows} />
    </SectionCard>
  );
}

export function EmploymentCard({ employee, users, displayUserRoles, onEdit }: Props) {
  const assignedRoles = ASSIGNABLE_ROLES.filter((r) => displayUserRoles.includes(r.role));
  const rows = [
    { label: "Designation", value: employee.designation || "-" },
    { label: "Joined", value: isoDate(employee.date_of_joining) },
    { label: "Tenure", value: tenureLabel(employee.date_of_joining) },
    ...(assignedRoles.length > 0
      ? [{
          label: "Roles",
          value: (
            <span className="flex flex-wrap gap-1">
              {assignedRoles.map((r) => (
                <Badge key={r.role} variant={r.variant as BadgeVariant}>{r.label}</Badge>
              ))}
            </span>
          ),
        }]
      : []),
    ...(employee.ctc != null ? [{ label: "CTC", value: formatVND(employee.ctc) }] : []),
    ...(employee.custom_insurance_salary != null ? [{ label: "Insurance salary (BHXH)", value: formatVND(employee.custom_insurance_salary) }] : []),
    ...(employee.custom_number_of_dependents != null ? [{ label: "Tax dependents", value: employee.custom_number_of_dependents }] : []),
    ...(employee.leave_approver
      ? [{ label: "Leave approver", value: users.find((u) => u.name === employee.leave_approver)?.full_name || employee.leave_approver }]
      : []),
  ];
  return (
    <SectionCard title="Employment" action={<EditIconButton label="Edit employment" onClick={() => onEdit("employment")} />}>
      <FactList rows={rows} />
    </SectionCard>
  );
}
