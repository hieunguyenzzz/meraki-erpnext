import { useEffect, useRef, useState } from "react";
import { useOne, useUpdate } from "@refinedev/core";
import { AlertCircle, Banknote, Cake, CalendarDays, FileCheck, Loader2, Mail, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { Switch } from "./Switch";

type IconType = React.FC<{ className?: string }>;

interface HRSettings {
  send_birthday_reminders: number;
  send_work_anniversary_reminders: number;
  send_holiday_reminders: number;
  send_leave_notification: number;
  custom_send_welcome_email_on_invite: number;
}

interface PayrollSettings {
  email_salary_slip_to_employee: number;
}

const HR_FIELDS: { field: keyof HRSettings; icon: IconType; title: string; text: string }[] = [
  { field: "send_birthday_reminders", icon: Cake, title: "Birthday Reminder", text: "Sends a greeting to all employees on a colleague's birthday." },
  { field: "send_work_anniversary_reminders", icon: Trophy, title: "Work Anniversary Reminder", text: "Notifies the team when an employee reaches a work anniversary." },
  { field: "send_holiday_reminders", icon: CalendarDays, title: "Holiday Reminder", text: "Sends upcoming holiday notices to employees in advance." },
  { field: "send_leave_notification", icon: FileCheck, title: "Leave Approval Notification", text: "Emails the leave approver when a new leave application is submitted." },
  { field: "custom_send_welcome_email_on_invite", icon: Mail, title: "Welcome Email", text: "Send a welcome email with a registration link when inviting new staff." },
];

function Row({
  icon: Icon, title, text, checked, saving, onChange,
}: {
  icon: IconType; title: string; text: string; checked: boolean; saving: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{text}</p>
        </div>
      </div>
      <div className="flex w-11 shrink-0 justify-end">
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Switch checked={checked} onChange={onChange} label={title} />}
      </div>
    </li>
  );
}

/** Automatic reminder switches stored in HR Settings / Payroll Settings (same fields as before). */
export function ReminderToggles() {
  const { mutateAsync: updateRecord } = useUpdate();
  const { result: hr, query: hrQuery } = useOne<HRSettings>({
    resource: "HR Settings",
    id: "HR Settings",
    meta: { fields: HR_FIELDS.map((f) => f.field) },
  });
  const { result: payroll, query: payrollQuery } = useOne<PayrollSettings>({
    resource: "Payroll Settings",
    id: "Payroll Settings",
    meta: { fields: ["email_salary_slip_to_employee"] },
  });

  const [hrState, setHrState] = useState<Partial<HRSettings>>({});
  const [slip, setSlip] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => { if (hr) setHrState(hr); }, [hr]);
  useEffect(() => { if (payroll) setSlip(payroll.email_salary_slip_to_employee ?? 0); }, [payroll]);

  async function save(key: string, resource: string, field: string, value: boolean, rollback: (prev: number) => void, apply: (v: number) => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    const next = value ? 1 : 0;
    setSaving(key);
    setError(null);
    apply(next);
    try {
      await updateRecord({ resource, id: resource, values: { [field]: next } });
    } catch (err) {
      console.error("reminder toggle failed", field, err);
      rollback(next ? 0 : 1);
      setError("Could not save that change. It has been reverted.");
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }

  const loaded = hr !== undefined && payroll !== undefined;

  return (
    <section className="space-y-3" aria-labelledby="reminders-heading">
      <div>
        <h2 id="reminders-heading" className="text-base font-semibold">Automatic reminders</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scheduled emails sent by the HR module. Changes take effect immediately.
        </p>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {hrQuery.isError || payrollQuery.isError ? (
        <StatePanel
          kind="error"
          title="Could not load the reminder switches"
          text="Check your connection and try again."
          action={{ label: "Try again", onClick: () => { hrQuery.refetch(); payrollQuery.refetch(); } }}
        />
      ) : !loaded ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {HR_FIELDS.map((f) => (
            <Row
              key={f.field}
              icon={f.icon}
              title={f.title}
              text={f.text}
              checked={!!hrState[f.field]}
              saving={saving === f.field}
              onChange={(v) =>
                save(f.field, "HR Settings", f.field, v,
                  (prev) => setHrState((s) => ({ ...s, [f.field]: prev })),
                  (n) => setHrState((s) => ({ ...s, [f.field]: n })))
              }
            />
          ))}
          <Row
            icon={Banknote}
            title="Salary Slip Email"
            text="Automatically emails each employee their salary slip when submitted."
            checked={!!slip}
            saving={saving === "payroll"}
            onChange={(v) =>
              save("payroll", "Payroll Settings", "email_salary_slip_to_employee", v, setSlip, setSlip)
            }
          />
        </ul>
      )}
    </section>
  );
}
