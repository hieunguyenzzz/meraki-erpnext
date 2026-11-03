import { useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldShell } from "./Field";

interface FileFieldProps {
  id: string;
  label: string;
  file: File | null;
  onFile: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  hint: string;
  required?: boolean;
  optional?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function extBadge(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return (ext || "file").slice(0, 4).toUpperCase();
}

export function FileField({
  id,
  label,
  file,
  onFile,
  inputRef,
  accept = ".pdf,.doc,.docx",
  hint,
  required,
  optional,
}: FileFieldProps) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  const open = () => inputRef.current?.click();

  return (
    <FieldShell id={id} label={label} required={required} optional={optional}>
      <p id={`${id}-hint`} className="-mt-1 text-[13px] text-muted-foreground">
        {hint}
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
      {file ? (
        <div className="flex items-center gap-3 rounded-card border border-success/40 bg-card px-3.5 py-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-accent-foreground"
          >
            {extBadge(file.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{file.name}</span>
            <span className="text-xs text-success-soft-foreground">
              Selected · {formatSize(file.size)}
            </span>
          </span>
          <button
            type="button"
            id={id}
            onClick={open}
            aria-describedby={`${id}-hint`}
            className="h-12 shrink-0 rounded-md px-3 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Replace<span className="sr-only"> {label}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          id={id}
          onClick={open}
          aria-describedby={`${id}-hint`}
          className={cn(
            "flex min-h-[96px] w-full flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed px-4 py-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            dragging ? "border-primary bg-accent" : "border-input bg-card hover:border-primary hover:bg-accent/50"
          )}
        >
          <Upload aria-hidden="true" className="h-6 w-6 text-primary" />
          <span className="text-[15px] font-medium">Choose a file or drop it here</span>
        </button>
      )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </FieldShell>
  );
}
