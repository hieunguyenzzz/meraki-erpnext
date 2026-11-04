import { useRef, useState } from "react";
import { useCreate, useCustomMutation, useDelete, useInvalidate } from "@refinedev/core";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "./ConfirmModal";
import { useDesignations, useDesignationUsage, type Designation } from "./useSettingsData";

function errorText(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  // Frappe answers with a JSON blob containing HTML links; show a plain sentence instead.
  if (msg.includes("LinkExistsError")) return "An employee still has this job title, so it cannot be deleted.";
  if (msg.includes("DuplicateEntryError")) return "A job title with that name already exists.";
  return msg.startsWith("API error") ? fallback : msg || fallback;
}

const usedBy = (n: number) => (n === 0 ? "Not used" : n === 1 ? "1 person" : `${n} people`);

export function DesignationsTab() {
  const invalidate = useInvalidate();
  const { designations, query } = useDesignations();
  const { usage, query: usageQuery } = useDesignationUsage();
  const { mutateAsync: createDoc } = useCreate();
  const { mutateAsync: customMutate } = useCustomMutation();
  const { mutateAsync: deleteDoc } = useDelete();

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
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

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    return run(
      async () => { await createDoc({ resource: "Designation", values: { designation_name: name } }); },
      "Failed to create designation",
      () => setNewName(""),
    );
  };

  const startEdit = (d: Designation) => { setError(null); setEditing(d.name); setEditValue(d.name); };

  const saveEdit = () => {
    const old = editing;
    const name = editValue.trim();
    if (!old || !name) return;
    if (name === old) { setEditing(null); return; }
    return run(
      async () => {
        await customMutate({
          url: "/api/method/frappe.client.rename_doc",
          method: "post",
          values: { doctype: "Designation", old_name: old, new_name: name, merge: false },
        });
      },
      "Failed to rename designation",
      () => setEditing(null),
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

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="flex min-w-0 flex-[1_1_260px]">
          <span className="sr-only">New job title</span>
          <Input
            placeholder="New job title, e.g. Junior Planner"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={!newName.trim() || busy}>
          {busy && editing === null && <Loader2 className="animate-spin" />}
          + Add title
        </Button>
      </form>

      {error && editing === null && deleteTarget === null && (
        <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

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
        <StatePanel kind="empty" title="No job titles yet" text="Add the first one above to start assigning titles." />
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="hidden items-center gap-3 bg-muted px-[18px] py-3 text-xs font-semibold text-muted-foreground md:flex">
            <span className="flex-1">Title</span>
            <span className="w-[120px]">Used by</span>
            <span className="w-[170px]" />
          </div>
          <ul className="divide-y md:border-t">
            {designations.map((d) => {
              const count = usage.get(d.name) ?? 0;
              const isEditing = editing === d.name;
              const deleteBlocked = usageQuery.isLoading || count > 0;
              return (
                <li
                  key={d.name}
                  className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-[18px] py-3 md:min-h-14", isEditing && "bg-accent")}
                >
                  {isEditing ? (
                    <label className="flex min-w-0 flex-[1_1_200px]">
                      <span className="sr-only">Rename {d.name}</span>
                      <Input
                        value={editValue}
                        autoFocus
                        className="border-primary"
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    </label>
                  ) : (
                    <b className="min-w-0 flex-[1_1_200px] break-words text-[15px]">{d.name}</b>
                  )}
                  <span className="text-sm text-muted-foreground md:w-[120px]">
                    {usageQuery.isLoading ? "…" : usedBy(count)}
                  </span>
                  <span className="flex gap-1.5 md:w-[170px]">
                    {isEditing ? (
                      <>
                        <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90" onClick={saveEdit} disabled={!editValue.trim() || busy}>
                          {busy && <Loader2 className="animate-spin" />} Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEdit(d)} aria-label={`Rename ${d.name}`}>Rename</Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deleteBlocked}
                          title={count > 0 ? "In use. Move those people to another title first." : undefined}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Delete ${d.name}`}
                          onClick={() => { setError(null); setDeleteTarget(d); }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </span>
                  {isEditing && error && (
                    <div role="alert" className="flex w-full items-start gap-2 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-[13px] text-muted-foreground">A title in use can't be deleted. Move those people to another title first.</p>

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete job title"
        body={<>Delete <b className="text-foreground">{deleteTarget?.name}</b>? This cannot be undone.</>}
        confirmLabel="Delete"
        destructive
        busy={busy}
        error={error}
        onConfirm={remove}
      />
    </div>
  );
}
