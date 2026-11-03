import { useRef, useState } from "react";
import { useInvalidate, useList } from "@refinedev/core";
import { FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { attachExpenseReceipt } from "@/lib/fileUpload";

interface FileRow { name: string; file_name: string; file_url: string; file_size: number; is_private: number }

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|$)/i;
const href = (f: FileRow) => (f.is_private ? `/api/method/frappe.utils.file_manager.download_file?file_url=${encodeURIComponent(f.file_url)}` : f.file_url);

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Receipts attached to a Purchase Invoice: thumbnails (tap to enlarge) and upload through the backend (large / HEIC safe). */
export function ReceiptsCard({ piName }: { piName: string }) {
  const invalidate = useInvalidate();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

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

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || busy.current) return;
    busy.current = true;
    setUploading(true);
    setError(null);
    try {
      await attachExpenseReceipt(file, piName);
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

  return (
    <section className="rounded-card border bg-card p-4 md:p-5" aria-labelledby="receipts-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="receipts-title" className="font-display text-2xl font-semibold">Bill{files.length > 1 ? "s" : ""}</h2>
        <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" className="hidden" onChange={upload} aria-label="Choose a bill file" />
        <Button variant="outline" disabled={uploading} onClick={() => input.current?.click()} className="max-md:h-12">
          {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
          {uploading ? "Uploading..." : "Upload bill"}
        </Button>
      </div>
      {error && <div role="alert" className="mb-3 rounded-md bg-danger-soft p-3 text-sm text-danger-soft-foreground">{error}</div>}
      {query.isLoading ? (
        <Skeleton className="h-32 w-full rounded-card" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger-soft-foreground">Couldn't load the attachments.</p>
      ) : files.length === 0 ? (
        <p className="rounded-card bg-muted px-4 py-8 text-center text-sm text-muted-foreground">No bill attached yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <li key={f.name} className="flex flex-col gap-1.5">
              {IMAGE.test(f.file_url) ? (
                <button type="button" onClick={() => setPreview(href(f))} aria-label={`Enlarge ${f.file_name}`}
                  className="group relative aspect-square overflow-hidden rounded-card border bg-muted">
                  <img src={href(f)} alt={f.file_name} loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-sm font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Preview</span>
                </button>
              ) : (
                <a href={href(f)} target="_blank" rel="noopener noreferrer"
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-card border bg-muted text-muted-foreground hover:text-foreground">
                  <FileText className="h-8 w-8" aria-hidden />
                  <span className="text-xs font-semibold">Open file</span>
                </a>
              )}
              <p className="truncate text-xs text-muted-foreground" title={f.file_name}>{f.file_name} · {size(f.file_size ?? 0)}</p>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-[95vw] border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
          <DialogTitle className="sr-only">Bill preview</DialogTitle>
          {preview && <img src={preview} alt="Bill" className="max-h-[85dvh] w-full rounded-card object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
