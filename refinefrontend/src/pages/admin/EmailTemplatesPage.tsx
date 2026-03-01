import { useState, useEffect } from "react";
import { useList, useUpdate, useOne, useInvalidate } from "@refinedev/core";
import {
  Pencil, Loader2, Mail, Bell, Cake, Trophy, CalendarDays,
  FileCheck, Banknote, AlertCircle, CheckCircle2, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Notification {
  name: string;
  subject: string;
  message: string;
  enabled: number;
  event: string;
  document_type: string;
  channel: string;
}

interface HRSettings {
  send_birthday_reminders: number;
  send_work_anniversary_reminders: number;
  send_holiday_reminders: number;
  send_leave_notification: number;
}

interface PayrollSettings {
  email_salary_slip_to_employee: number;
}

// ---------------------------------------------------------------------------
// Toggle component (no extra package needed)
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent",
        "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring focus-visible:ring-offset-2",
        checked ? "bg-primary" : "bg-input",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-background",
          "shadow-lg ring-0 transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Edit Notification Sheet
// ---------------------------------------------------------------------------

function EditNotificationSheet({
  notification,
  onClose,
  onSuccess,
}: {
  notification: Notification | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const { mutateAsync: updateRecord } = useUpdate();

  useEffect(() => {
    if (notification) {
      setSubject(notification.subject ?? "");
      setMessage(notification.message ?? "");
      setError(null);
      setTestEmail("");
      setTestResult(null);
    }
  }, [notification]);

  const handleSendTest = async () => {
    if (!notification || !testEmail.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/inquiry-api/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          notification_name: notification.name,
          recipient_email: testEmail.trim(),
        }),
      });
      if (res.ok) {
        setTestResult({ ok: true, msg: `Test email sent to ${testEmail.trim()}` });
      } else {
        const err = await res.json().catch(() => ({}));
        setTestResult({ ok: false, msg: err.detail ?? "Failed to send" });
      }
    } catch {
      setTestResult({ ok: false, msg: "Network error" });
    } finally {
      setTestSending(false);
    }
  };

  const handleSave = async () => {
    if (!notification) return;
    setError(null);
    setIsSaving(true);
    try {
      await updateRecord({
        resource: "Notification",
        id: notification.name,
        values: { subject, message },
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const channelBadge = notification
    ? notification.channel === "Email"
      ? <Badge variant="info" className="text-[10px] h-4 px-1.5">Email</Badge>
      : <Badge variant="secondary" className="text-[10px] h-4 px-1.5">System</Badge>
    : null;

  return (
    <Sheet open={notification !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[600px] sm:max-w-[600px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-5 border-b">
          <SheetTitle className="text-base">Edit Notification</SheetTitle>
          {notification && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground font-medium">{notification.name}</span>
              {channelBadge}
              {notification.document_type && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {notification.document_type}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="notif-subject" className="text-sm font-medium">Subject</Label>
            <Input
              id="notif-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Birthday Reminder: {{ doc.first_name }}"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-message" className="text-sm font-medium">Message</Label>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Supports HTML and Jinja2 templating.</span>
              <code className="bg-muted rounded px-1 py-0.5 text-[11px]">{"{{ doc.field }}"}</code>
              <span>inserts field values.</span>
            </div>
            <Textarea
              id="notif-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="font-mono text-xs leading-relaxed min-h-[340px] resize-none"
              placeholder={"<p>Dear {{ doc.employee_name }},</p>\n<p>This is a reminder that...</p>"}
            />
          </div>

          <Separator />
          <div className="space-y-2">
            <Label className="text-sm font-medium">Send Test Email</Label>
            <p className="text-xs text-muted-foreground">
              Sends the saved template to the address you specify. Template variables shown as-is.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={testEmail}
                onChange={(e) => { setTestEmail(e.target.value); setTestResult(null); }}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendTest}
                disabled={testSending || !testEmail.trim()}
                className="shrink-0"
              >
                {testSending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Send Test
              </Button>
            </div>
            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                {testResult.ok
                  ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                  : <AlertCircle className="h-4 w-4 shrink-0" />}
                <span>{testResult.msg}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t bg-muted/30 flex-row justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// HR Settings toggle row
// ---------------------------------------------------------------------------

function HRSettingRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  saving,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium leading-none">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="ml-4 shrink-0">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Toggle checked={checked} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EmailTemplatesPage() {
  const invalidate = useInvalidate();
  const { mutateAsync: updateRecord } = useUpdate();

  // ── Notification doctype records ──────────────────────────────────────────
  const { result: notifList, query: notifQuery } = useList<Notification>({
    resource: "Notification",
    pagination: { mode: "off" },
    sorters: [{ field: "document_type", order: "asc" }],
    meta: {
      fields: ["name", "subject", "message", "enabled", "event", "document_type", "channel"],
    },
  });
  const notifications = (notifList?.data ?? []) as Notification[];
  const notifLoading = notifQuery?.isLoading;

  // ── HR Settings (singleton) ───────────────────────────────────────────────
  const { result: hrSettings } = useOne<HRSettings>({
    resource: "HR Settings",
    id: "HR Settings",
    meta: {
      fields: [
        "send_birthday_reminders",
        "send_work_anniversary_reminders",
        "send_holiday_reminders",
        "send_leave_notification",
      ],
    },
  });

  // ── Payroll Settings (singleton) ──────────────────────────────────────────
  const { result: payrollSettings } = useOne<PayrollSettings>({
    resource: "Payroll Settings",
    id: "Payroll Settings",
    meta: { fields: ["email_salary_slip_to_employee"] },
  });

  // ── Local state for HR toggles (optimistic) ───────────────────────────────
  const [hrState, setHRState] = useState<HRSettings>({
    send_birthday_reminders: 0,
    send_work_anniversary_reminders: 0,
    send_holiday_reminders: 0,
    send_leave_notification: 0,
  });
  const [payrollEmailSlip, setPayrollEmailSlip] = useState(0);
  const [savingHR, setSavingHR] = useState<string | null>(null);

  // Sync from API once loaded
  useEffect(() => {
    if (hrSettings) {
      setHRState({
        send_birthday_reminders: hrSettings.send_birthday_reminders ?? 0,
        send_work_anniversary_reminders: hrSettings.send_work_anniversary_reminders ?? 0,
        send_holiday_reminders: hrSettings.send_holiday_reminders ?? 0,
        send_leave_notification: hrSettings.send_leave_notification ?? 0,
      });
    }
  }, [hrSettings]);

  useEffect(() => {
    if (payrollSettings) {
      setPayrollEmailSlip(payrollSettings.email_salary_slip_to_employee ?? 0);
    }
  }, [payrollSettings]);

  // Toggle HR setting
  const toggleHR = async (field: keyof HRSettings, value: boolean) => {
    const intVal = value ? 1 : 0;
    setSavingHR(field);
    setHRState((prev) => ({ ...prev, [field]: intVal }));
    try {
      await updateRecord({
        resource: "HR Settings",
        id: "HR Settings",
        values: { [field]: intVal },
      });
    } catch {
      setHRState((prev) => ({ ...prev, [field]: intVal === 1 ? 0 : 1 })); // rollback
    } finally {
      setSavingHR(null);
    }
  };

  // Toggle Payroll setting
  const togglePayroll = async (value: boolean) => {
    const intVal = value ? 1 : 0;
    setSavingHR("payroll");
    setPayrollEmailSlip(intVal);
    try {
      await updateRecord({
        resource: "Payroll Settings",
        id: "Payroll Settings",
        values: { email_salary_slip_to_employee: intVal },
      });
    } catch {
      setPayrollEmailSlip(intVal === 1 ? 0 : 1); // rollback
    } finally {
      setSavingHR(null);
    }
  };

  // ── Notification toggle + edit ────────────────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Notification | null>(null);

  const handleNotifToggle = async (notif: Notification) => {
    setTogglingId(notif.name);
    try {
      await updateRecord({
        resource: "Notification",
        id: notif.name,
        values: { enabled: notif.enabled ? 0 : 1 },
      });
      invalidate({ resource: "Notification", invalidates: ["list"] });
    } catch (err) {
      console.error("toggle failed", err);
    } finally {
      setTogglingId(null);
    }
  };

  const hrSettingsLoaded = hrSettings !== undefined;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage automated emails and notification rules sent by the system.
        </p>
      </div>

      {/* ── Section 1: Notification Rules ────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold">Notification Rules</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Event-triggered emails configured in ERPNext. Edit subjects and message templates.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b bg-muted/40">
                <TableHead className="text-xs font-medium h-9 w-[30%]">Name</TableHead>
                <TableHead className="text-xs font-medium h-9 w-[20%]">Document Type</TableHead>
                <TableHead className="text-xs font-medium h-9 w-[16%]">Event</TableHead>
                <TableHead className="text-xs font-medium h-9 w-[14%]">Channel</TableHead>
                <TableHead className="text-xs font-medium h-9 w-[10%]">Enabled</TableHead>
                <TableHead className="text-xs font-medium h-9 w-[10%] text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : notifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                    No notification rules found.
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((n) => (
                  <TableRow key={n.name} className="group">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        {n.channel === "Email"
                          ? <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          : <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        }
                        <span className="text-sm font-medium">{n.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-sm text-muted-foreground">
                        {n.document_type || <span className="italic text-muted-foreground/60">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-sm text-muted-foreground">{n.event || "—"}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      {n.channel === "Email" ? (
                        <Badge variant="info" className="text-[10px] h-5 px-1.5">Email</Badge>
                      ) : n.channel === "System Notification" ? (
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">System</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">{n.channel}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <Toggle
                        checked={!!n.enabled}
                        onChange={() => handleNotifToggle(n)}
                        disabled={togglingId === n.name}
                      />
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setEditTarget(n)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Separator />

      {/* ── Section 2: HR Scheduler Reminders ────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">HR Email Reminders</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scheduled emails sent automatically by the HR module. Changes take effect immediately.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* HR Settings Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">People &amp; Events</CardTitle>
              <CardDescription className="text-xs">
                Reminders tied to employee milestones and time off.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {!hrSettingsLoaded ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <HRSettingRow
                    icon={Cake}
                    title="Birthday Reminder"
                    description="Sends a greeting to all employees on a colleague's birthday."
                    checked={!!hrState.send_birthday_reminders}
                    onChange={(v) => toggleHR("send_birthday_reminders", v)}
                    saving={savingHR === "send_birthday_reminders"}
                  />
                  <HRSettingRow
                    icon={Trophy}
                    title="Work Anniversary Reminder"
                    description="Notifies the team when an employee reaches a work anniversary."
                    checked={!!hrState.send_work_anniversary_reminders}
                    onChange={(v) => toggleHR("send_work_anniversary_reminders", v)}
                    saving={savingHR === "send_work_anniversary_reminders"}
                  />
                  <HRSettingRow
                    icon={CalendarDays}
                    title="Holiday Reminder"
                    description="Sends upcoming holiday notices to employees in advance."
                    checked={!!hrState.send_holiday_reminders}
                    onChange={(v) => toggleHR("send_holiday_reminders", v)}
                    saving={savingHR === "send_holiday_reminders"}
                  />
                  <HRSettingRow
                    icon={FileCheck}
                    title="Leave Approval Notification"
                    description="Emails the leave approver when a new leave application is submitted."
                    checked={!!hrState.send_leave_notification}
                    onChange={(v) => toggleHR("send_leave_notification", v)}
                    saving={savingHR === "send_leave_notification"}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Payroll Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payroll</CardTitle>
              <CardDescription className="text-xs">
                Emails related to salary and payroll processing.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {payrollSettings === undefined ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <HRSettingRow
                  icon={Banknote}
                  title="Salary Slip Email"
                  description="Automatically emails each employee their salary slip when submitted."
                  checked={!!payrollEmailSlip}
                  onChange={togglePayroll}
                  saving={savingHR === "payroll"}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Sheet */}
      <EditNotificationSheet
        notification={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={() => invalidate({ resource: "Notification", invalidates: ["list"] })}
      />
    </div>
  );
}
