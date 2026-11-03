import { useEffect, useMemo, useRef, useState } from "react";
import { useInvalidate, useUpdate } from "@refinedev/core";
import { Bell, ChevronRight, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "./ConfirmModal";
import { ReminderToggles } from "./ReminderToggles";
import { TemplateEditor, type TemplateDraft } from "./TemplateEditor";
import { useNotificationRules, type NotificationRule } from "./useSettingsData";

function subtitle(n: NotificationRule): string {
  return [n.document_type, n.event].filter(Boolean).join(" · ") || n.channel;
}

function TemplateRow({ n, selected, onSelect }: { n: NotificationRule; selected: boolean; onSelect: () => void }) {
  const Icon = n.channel === "Email" ? Mail : Bell;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors max-md:min-h-14",
        selected ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1">
        <b className={cn("block line-clamp-2 break-words text-sm", selected && "text-accent-foreground")}>{n.name}</b>
        <span className="block truncate text-xs text-muted-foreground">{subtitle(n)}</span>
      </span>
      {!n.enabled && <Badge variant="secondary">Off</Badge>}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground md:hidden" />
    </button>
  );
}

export function NotificationsTab() {
  const invalidate = useInvalidate();
  const { mutateAsync: updateRecord } = useUpdate();
  const { notifications, query } = useNotificationRules();
  const desktop = useMediaQuery("(min-width: 1024px)");

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>({ subject: "", message: "" });
  const [pendingName, setPendingName] = useState<string | null>(null); // switch blocked by unsaved edits
  const [confirmClose, setConfirmClose] = useState(false); // phone sheet closed with unsaved edits
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const inFlight = useRef(false);

  // Desktop shows the first template straight away; phones start on the list.
  const effectiveName = selectedName ?? (desktop ? notifications[0]?.name ?? null : null);
  const selected = useMemo(
    () => notifications.find((n) => n.name === effectiveName) ?? null,
    [notifications, effectiveName],
  );
  const savedSubject = selected?.subject ?? "";
  const savedMessage = selected?.message ?? "";

  // Load the draft whenever a different template is opened.
  useEffect(() => {
    setDraft({ subject: savedSubject, message: savedMessage });
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.name]);

  const dirty = selected !== null && (draft.subject !== savedSubject || draft.message !== savedMessage);

  function choose(name: string) {
    if (name === effectiveName) { setSheetOpen(true); return; }
    if (dirty) { setPendingName(name); return; }
    setSelectedName(name);
    setSheetOpen(true);
  }

  async function save() {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await updateRecord({
        resource: "Notification",
        id: selected.name,
        values: { subject: draft.subject, message: draft.message },
      });
      await invalidate({ resource: "Notification", invalidates: ["list"] });
    } catch (err) {
      console.error("template save failed", err);
      setSaveError(err instanceof Error && err.message ? err.message : "Failed to save changes");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setToggling(true);
    try {
      await updateRecord({
        resource: "Notification",
        id: selected.name,
        values: { enabled: selected.enabled ? 0 : 1 },
      });
      await invalidate({ resource: "Notification", invalidates: ["list"] });
    } catch (err) {
      console.error("toggle failed", err);
      setSaveError("Could not change whether this template is active.");
    } finally {
      inFlight.current = false;
      setToggling(false);
    }
  }

  const editor = selected && (
    <TemplateEditor
      key={selected.name}
      template={selected}
      draft={draft}
      dirty={dirty}
      onDraftChange={setDraft}
      onSave={save}
      saving={saving}
      saveError={saveError}
      onToggleEnabled={toggleEnabled}
      toggling={toggling}
    />
  );

  const list = (
    <nav aria-label="Templates" className="flex flex-col gap-0.5 rounded-2xl border bg-card p-2">
      {notifications.map((n) => (
        <TemplateRow key={n.name} n={n} selected={desktop && n.name === effectiveName} onSelect={() => choose(n.name)} />
      ))}
    </nav>
  );

  return (
    <div className="space-y-8">
      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : query.isError ? (
        <StatePanel
          kind="error"
          title="Could not load email templates"
          text="Check your connection and try again."
          action={{ label: "Try again", onClick: () => query.refetch() }}
        />
      ) : notifications.length === 0 ? (
        <StatePanel kind="empty" title="No email templates" text="Notification rules created in ERPNext appear here." />
      ) : desktop ? (
        <div className="flex items-start gap-4">
          <div className="w-72 shrink-0">{list}</div>
          <section className="min-w-0 flex-1 rounded-2xl border bg-card p-5">{editor}</section>
        </div>
      ) : (
        <>
          {list}
          <Sheet open={sheetOpen && selected !== null} onOpenChange={(o) => { if (o) return; if (dirty) setConfirmClose(true); else setSheetOpen(false); }}>
            <SheetContent side="bottom" className="flex max-h-[92vh] flex-col gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b px-5 py-4 pr-16">
                <SheetTitle className="text-base">Edit template</SheetTitle>
              </SheetHeader>
              <div className="px-5 py-4 pb-10">{editor}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      <ReminderToggles />

      <ConfirmModal
        open={confirmClose}
        onOpenChange={(o) => { if (!o) setConfirmClose(false); }}
        title="Discard unsaved changes?"
        body={`Your edits to ${selected?.name ?? "this template"} have not been saved.`}
        confirmLabel="Discard"
        destructive
        busy={false}
        error={null}
        onConfirm={() => {
          if (selected) setDraft({ subject: savedSubject, message: savedMessage });
          setConfirmClose(false);
          setSheetOpen(false);
        }}
      />

      <ConfirmModal
        open={pendingName !== null}
        onOpenChange={(o) => { if (!o) setPendingName(null); }}
        title="Discard unsaved changes?"
        body={`Your edits to ${selected?.name ?? "this template"} have not been saved.`}
        confirmLabel="Discard"
        destructive
        busy={false}
        error={null}
        onConfirm={() => { setSelectedName(pendingName); setPendingName(null); setSheetOpen(true); }}
      />
    </div>
  );
}
