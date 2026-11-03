import { useRef, useState } from "react";
import { useCreate, useCustomMutation, useDelete, useInvalidate } from "@refinedev/core";
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { ConfirmModal } from "./ConfirmModal";
import { FormModal } from "./FormModal";
import { useDesignations, type Designation } from "./useSettingsData";

function errorText(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  // Frappe answers with a JSON blob containing HTML links; show a plain sentence instead.
  if (msg.includes("LinkExistsError")) return "An employee still has this job title, so it cannot be deleted.";
  if (msg.includes("DuplicateEntryError")) return "A job title with that name already exists.";
  return msg.startsWith("API error") ? fallback : msg || fallback;
}

/** One-field form used for both "add" and "rename". */
function NameForm({
  initial, submitLabel, busy, error, onSubmit, onCancel,
}: {
  initial: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const name = value.trim();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (name) onSubmit(name); }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="designation-name">Job title</Label>
        <Input
          id="designation-name"
          placeholder="e.g. Director"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </div>
      {error && (
        <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={!name || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function DesignationsTab() {
  const invalidate = useInvalidate();
  const { designations, query } = useDesignations();
  const { mutateAsync: createDoc } = useCreate();
  const { mutateAsync: customMutate } = useCustomMutation();
  const { mutateAsync: deleteDoc } = useDelete();

  const [addOpen, setAddOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Designation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = () => invalidate({ resource: "Designation", invalidates: ["list"] });

  /** Runs one write at a time; a ref (not state) blocks double taps. */
  async function run(action: () => Promise<void>, fallback: string, done: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      done();
      refresh();
    } catch (err) {
      console.error("designation write failed", err);
      setError(errorText(err, fallback));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const add = (name: string) =>
    run(
      async () => { await createDoc({ resource: "Designation", values: { designation_name: name } }); },
      "Failed to create designation",
      () => setAddOpen(false),
    );

  const rename = (name: string) => {
    if (!renameTarget) return;
    if (name === renameTarget.name) { setRenameTarget(null); return; }
    const old = renameTarget.name;
    return run(
      async () => {
        await customMutate({
          url: "/api/method/frappe.client.rename_doc",
          method: "post",
          values: { doctype: "Designation", old_name: old, new_name: name, merge: false },
        });
      },
      "Failed to rename designation",
      () => setRenameTarget(null),
    );
  };

  const remove = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.name;
    return run(
      async () => { await deleteDoc({ resource: "Designation", id }); },
      "Failed to delete designation",
      () => setDeleteTarget(null),
    );
  };

  const openAdd = () => { setError(null); setAddOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Job titles you can give to employees.</p>
        <Button onClick={openAdd}>
          <Plus /> Add job title
        </Button>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
        </div>
      ) : query.isError ? (
        <StatePanel
          kind="error"
          title="Could not load job titles"
          text="Check your connection and try again."
          action={{ label: "Try again", onClick: () => query.refetch() }}
        />
      ) : designations.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No job titles yet"
          text="Add the first one to start assigning titles."
          action={{ label: "Add job title", onClick: openAdd, icon: <Plus /> }}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {designations.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2 py-1 pl-4 pr-2">
              <span className="min-w-0 truncate text-sm font-semibold">{d.name}</span>
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Rename ${d.name}`}
                  onClick={() => { setError(null); setRenameTarget(d); }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${d.name}`}
                  className="text-destructive hover:text-destructive"
                  onClick={() => { setError(null); setDeleteTarget(d); }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormModal open={addOpen} onOpenChange={(o) => { if (!busy) setAddOpen(o); }} title="Add job title">
        <NameForm initial="" submitLabel="Add" busy={busy} error={error} onSubmit={add} onCancel={() => setAddOpen(false)} />
      </FormModal>

      <FormModal
        open={renameTarget !== null}
        onOpenChange={(o) => { if (!busy && !o) setRenameTarget(null); }}
        title="Rename job title"
      >
        {renameTarget && (
          <NameForm
            key={renameTarget.name}
            initial={renameTarget.name}
            submitLabel="Save"
            busy={busy}
            error={error}
            onSubmit={rename}
            onCancel={() => setRenameTarget(null)}
          />
        )}
      </FormModal>

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete job title"
        body={<>Delete <b className="text-foreground">{deleteTarget?.name}</b>? This cannot be undone, and fails if an employee still has this title.</>}
        confirmLabel="Delete"
        destructive
        busy={busy}
        error={error}
        onConfirm={remove}
      />
    </div>
  );
}
