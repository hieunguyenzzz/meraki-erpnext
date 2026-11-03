import { useEffect, useRef, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { AlertCircle, ChevronLeft, ChevronRight, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { uploadFile } from "@/lib/fileUpload";

export interface VendorImage {
  name: string;
  file_url: string;
  file_name?: string;
}

interface Props {
  vendorName: string;
  images: VendorImage[];
  loading: boolean;
}

export function VendorGalleryTab({ vendorName, images, loading }: Props) {
  const invalidate = useInvalidate();
  const uploadingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || images.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadFile(file, "Supplier", vendorName, false);
      invalidate({ resource: "File", invalidates: ["list"] });
    } catch (err) {
      console.error("Vendor photo upload failed", err);
      setUploadError("Upload failed. Please try again.");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const pick = () => fileInputRef.current?.click();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {images.length} {images.length === 1 ? "photo" : "photos"}
        </p>
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUpload} />
        <Button variant="outline" disabled={uploading} onClick={pick}>
          <ImagePlus className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload Photo"}
        </Button>
      </div>

      {uploadError && (
        <div role="alert" className="flex gap-2 rounded-xl border border-destructive/20 bg-danger-soft p-3 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-sm">{uploadError}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3" aria-busy="true" aria-label="Loading photos">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-border/60" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <button
          type="button"
          onClick={pick}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-16 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <ImagePlus className="h-10 w-10" />
          <span className="text-sm">No photos yet. Upload the first one.</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {images.map((img, idx) => (
            <button
              key={img.name}
              type="button"
              aria-label={`Open photo ${idx + 1}`}
              className="aspect-square overflow-hidden rounded-xl transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setIndex(idx);
                setOpen(true);
              }}
            >
              <img src={img.file_url} alt={img.file_name ?? ""} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl border-none bg-black/95 p-0">
          <DialogTitle className="sr-only">Vendor photo {index + 1} of {images.length}</DialogTitle>
          <div className="relative flex min-h-[400px] items-center justify-center">
            {images[index] && (
              <img src={images[index].file_url} alt={images[index].file_name ?? ""} className="max-h-[80vh] max-w-full object-contain" />
            )}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => setIndex((i) => (i + 1) % images.length)}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
                  {index + 1} / {images.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
