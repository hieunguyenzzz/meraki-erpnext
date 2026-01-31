import { useGetIdentity, useList, useOne } from "@refinedev/core";
import type { EmployeeProfile } from "@/lib/types";

const PROFILE_FIELDS = [
  "name", "employee_name", "first_name", "middle_name", "last_name",
  "gender", "date_of_birth", "designation", "department", "status",
  "date_of_joining", "cell_phone", "personal_email",
  "current_address", "permanent_address",
  "person_to_be_contacted", "emergency_phone_number", "relation",
  "bank_name", "bank_ac_no", "iban",
];

export function useMyEmployee() {
  const { data: identity } = useGetIdentity<{ email: string }>();
  const email = identity?.email;

  const { result: listResult, query: listQuery } = useList<{ name: string }>({
    resource: "Employee",
    filters: email ? [{ field: "user_id", operator: "eq", value: email }] : [],
    meta: { fields: ["name"] },
    pagination: { mode: "off" },
    queryOptions: { enabled: !!email },
  });

  const employeeId = listResult?.data?.[0]?.name;

  const { result: employee, query: oneQuery } = useOne<EmployeeProfile>({
    resource: "Employee",
    id: employeeId ?? "",
    meta: { fields: PROFILE_FIELDS },
    queryOptions: { enabled: !!employeeId },
  });

  return {
    employee: employee ?? null,
    employeeId: employeeId ?? null,
    isLoading: listQuery.isLoading || oneQuery.isLoading,
    refetch: oneQuery.refetch,
  };
}
