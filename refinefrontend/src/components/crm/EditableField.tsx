import { useState, useRef, useEffect } from "react";
import { useCustomMutation } from "@refinedev/core";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractErrorMessage } from "@/lib/errors";

type EditableFieldProps = {
  label: string;
  value: string | number | undefined | null;
  displayValue?: string;
  fieldName: string;
  doctype: string;
  docName: string;
  type?: "text" | "date" | "number" | "select";
  options?: string[];
  onSaved: () => void;
};

export function EditableField({ label, value, displayValue, fieldName, doctype, docName, type = "text", options, onSaved }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: customMutation } = useCustomMutation();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setEditValue(String(value ?? ""));
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    const newValue = type === "number" ? (editValue === "" ? 0 : Number(editValue)) : editValue;
    if (String(newValue) === String(value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await customMutation({
        url: "/api/method/frappe.client.set_value",
        method: "post",
        values: { doctype, name: docName, fieldname: fieldName, value: newValue },
      });
      onSaved();
    } catch (err) {
      console.error(`Failed to update ${fieldName}:`, err);
      alert(extractErrorMessage(err, `Failed to update ${label}.`));
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function cancel() {
    setEditing(false);
    setEditValue(String(value ?? ""));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  }

  const isEmpty = value == null || value === "" || (type === "number" && value === 0);
  const shown = displayValue ?? (isEmpty ? "-" : String(value));

  if (editing && type === "select" && options) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground text-sm">{label}</span>
        <Select value={editValue} onValueChange={(v) => { setEditValue(v); }}>
          <SelectTrigger className="w-[180px] h-8" autoFocus onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">—</SelectItem>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-2">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={save} disabled={saving}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancel}>Cancel</Button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground text-sm">{label}</span>
        <Input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          className="w-[180px] h-8 text-sm"
          disabled={saving}
        />
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center group cursor-pointer" onClick={startEdit}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm group-hover:underline group-hover:decoration-dashed group-hover:underline-offset-4 group-hover:text-foreground transition-colors">
        {shown}
      </span>
    </div>
  );
}
