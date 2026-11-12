import { useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";
import { FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { attachExpenseReceipt } from "@/lib/fileUpload";
import { DetailCard } from "../DetailCard";

interface FileRow { name: string; file_name: string; file_url: string; file_size: number; is_private: number }

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|$)/i;
const href = (f: FileRow) => (f.is_private ? `/api/method/frappe.utils.file_manager.download_file?file_url=${encodeURIComponent(f.file_url)}` : f.file_url);

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Bill / receipt of a Purchase Invoice (D-Expense): large preview, replace or add another, upload through the backend (large / HEIC safe). */
export function ReceiptsCard({ piName }: { piName: string }) {
  const invalidate = useInvalidate();
  const input = useRef<HTMLInputElement>(null);
  const mode = useRef<"replace" | "add">("add");
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [picked, setPicked] = useState(0);

  const { result, query } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [
      { field: "attached_to_doctype", operator: "eq", value: "Purchase Invoice" },
      { field: "attached_to_name", operator: "eq", value: piName },
    ],
    meta: { fields: ["name", "file_name", "file_url", "file_size", "is_private", "creation"] },
  });
  const files = ((result?.data ?? []) as FileRow[]).filter((f) => f.file_url);
  const current = files[Math.min(picked, files.length - 1)];

  function choose(kind: "replace" | "add") {
    if (busy.current) return;
    if (kind === "replace" && !confirm(files.length > 1 ? `Replace all ${files.length} attached bills with a new file?` : "Replace the attached bill with a new file?")) return;
    mode.current = kind;
    input.current?.click();
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || busy.current) return;
    busy.current = true;
    setUploading(true);
    setError(null);
    try {
      const res = await attachExpenseReceipt(file, piName, { replace: mode.current === "replace" });
      if (res.warning) setError(res.warning);
      setPicked(0);
      invalidate({ resource: "File", invalidates: ["list"] });
    } catch (err) {
      console.error("Receipt upload failed", piName, err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      busy.current = false;
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  const spinner = uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />;

  return (
    <DetailCard
      title={files.length > 1 ? "Bills" : "Receipt"}
      aside={current && <span className="truncate text-xs text-muted-foreground" title={current.file_name}>{current.file_name} · {size(current.file_size ?? 0)}</span>}
      className="md:max-w-[420px]"
    >
      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" className="hidden" onChange={upload} aria-label="Choose a bill file" />
      {error && <div role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground">{error}</div>}
      {query.isLoading ? (
        <Skeleton className="h-[380px] w-full rounded-xl" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger-soft-foreground">Couldn't load the attachments.</p>
      ) : !current ? (
        <>
          <p className="flex h-40 items-center justify-center rounded-xl bg-muted px-4 text-center text-sm text-muted-foreground">No bill attached yet.</p>
          <Button variant="outline" disabled={uploading} onClick={() => choose("add")} className="w-full">{spinner} {uploading ? "Uploading..." : "Upload bill"}</Button>
        </>
      ) : (
        <>
          {IMAGE.test(current.file_url) ? (
            <button type="button" onClick={() => setPreview(href(current))} aria-label={`Enlarge ${current.file_name}`}
              className="group relative h-[300px] overflow-hidden rounded-xl bg-muted md:h-[380px]">
              <img src={href(current)} alt={current.file_name} loading="lazy" className="h-full w-full object-contain" />
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-sm font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Click to zoom</span>
            </button>
          ) : (
            <a href={href(current)} target="_blank" rel="noopener noreferrer"
              className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground">
              <FileText className="h-8 w-8" aria-hidden />
              <span className="text-sm font-semibold">Open file</span>
            </a>
          )}
          {files.length > 1 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={f.name}>
                  <button type="button" onClick={() => setPicked(i)} aria-pressed={f === current}
                    className={`max-w-40 truncate rounded-full border px-3 py-1 text-xs ${f === current ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>{f.file_name}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={uploading} onClick={() => choose("replace")} className="flex-1">{spinner} Replace photo</Button>
            <Button variant="outline" disabled={uploading} onClick={() => choose("add")} className="flex-1">Upload another</Button>
          </div>
        </>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-[95vw] border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
          <DialogTitle className="sr-only">Bill preview</DialogTitle>
          {preview && <img src={preview} alt="Bill" className="max-h-[85dvh] w-full rounded-card object-contain" />}
        </DialogContent>
      </Dialog>
    </DetailCard>
  );
}
