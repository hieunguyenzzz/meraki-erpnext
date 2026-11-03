import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { nowTimeVN } from "@/lib/businessTime";
import { Switch } from "./Switch";
import { TemplatePreview } from "./TemplatePreview";
import type { NotificationRule } from "./useSettingsData";

export interface TemplateDraft {
  subject: string;
  message: string;
}

interface Props {
  template: NotificationRule;
  draft: TemplateDraft;
  dirty: boolean;
  onDraftChange: (d: TemplateDraft) => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
  onToggleEnabled: () => void;
  toggling: boolean;
}

type Mode = "edit" | "preview";

export function TemplateEditor({
  template, draft, dirty, onDraftChange, onSave, saving, saveError, onToggleEnabled, toggling,
}: Props) {
  const [mode, setMode] = useState<Mode>("edit");
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const emailOk = /^\S+@\S+\.\S+$/.test(testEmail.trim());

  async function sendTest() {
    if (testing || !emailOk || dirty) return;
    const to = testEmail.trim();
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/inquiry-api/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notification_name: template.name, recipient_email: to }),
      });
      if (res.ok) {
        setTestResult({ ok: true, msg: `Test sent to ${to} at ${nowTimeVN()}.` });
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("test email failed", res.status, err);
        setTestResult({ ok: false, msg: typeof err.detail === "string" ? err.detail : "Failed to send" });
      }
    } catch (err) {
      console.error("test email network error", err);
      setTestResult({ ok: false, msg: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{template.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={template.channel === "Email" ? "info" : "secondary"}>
              {template.channel === "Email" ? "Email" : template.channel === "System Notification" ? "System" : template.channel}
            </Badge>
            {template.document_type && <Badge variant="outline">{template.document_type}</Badge>}
            {template.event && <span className="text-xs text-muted-foreground">{template.event}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <span>{template.enabled ? "Active" : "Off"}</span>
          <Switch checked={!!template.enabled} onChange={onToggleEnabled} disabled={toggling} label={`${template.name} active`} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tpl-subject">Subject</Label>
        <Input
          id="tpl-subject"
          value={draft.subject}
          onChange={(e) => onDraftChange({ ...draft, subject: e.target.value })}
          placeholder="e.g. Birthday Reminder: {{ doc.first_name }}"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="tpl-message">Body</Label>
          <div role="group" aria-label="Body view" className="flex rounded-full border border-input p-0.5 text-xs font-semibold">
            {(["edit", "preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-8 rounded-full px-3 capitalize",
                  mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {mode === "edit" ? (
          <>
            <Textarea
              id="tpl-message"
              value={draft.message}
              onChange={(e) => onDraftChange({ ...draft, message: e.target.value })}
              rows={12}
              className="resize-y font-mono text-xs leading-relaxed max-md:text-sm"
              placeholder={"<p>Dear {{ doc.employee_name }},</p>"}
            />
            <p className="text-xs text-muted-foreground">
              HTML and Jinja2. <code className="rounded bg-muted px-1">{"{{ doc.field }}"}</code> inserts a field value when the email is sent.
            </p>
          </>
        ) : (
          <TemplatePreview html={draft.message} />
        )}
      </div>

      {saveError && (
        <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <label className="flex min-w-[12rem] flex-1 basis-56">
          <span className="sr-only">Send test to</span>
          <Input
            type="email"
            placeholder="Send test to you@example.com"
            value={testEmail}
            onChange={(e) => { setTestEmail(e.target.value); setTestResult(null); }}
          />
        </label>
        <Button variant="outline" onClick={sendTest} disabled={testing || !emailOk || dirty}>
          {testing ? <Loader2 className="animate-spin" /> : <Send />}
          Send test
        </Button>
        <Button onClick={onSave} disabled={!dirty || saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save template
        </Button>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {dirty
          ? "Save your changes first: the test email sends the saved template."
          : "Sends a real email of the saved template. Placeholders appear as written."}
      </p>
      {testResult && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm",
            testResult.ok ? "bg-success-soft text-success-soft-foreground" : "bg-danger-soft text-danger-soft-foreground",
          )}
        >
          {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{testResult.msg}</span>
        </div>
      )}
    </div>
  );
}
