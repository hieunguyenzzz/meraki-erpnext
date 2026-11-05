import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, X, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  file: File | null;
  onChange: (file: File | null) => void;
  onScan: () => void;
  scanning: boolean;
}

const tile = "flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-input bg-card text-sm font-semibold";

/** Camera / gallery pickers with a removable thumbnail. Large and HEIC files are converted by the backend. */
export function ReceiptPicker({ file, onChange, onScan, scanning }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    setBroken(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onChange(f);
    e.target.value = "";
  }

  return (
    <div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" data-testid="receipt-camera" />
      <input ref={galleryRef} type="file" accept="image/*" onChange={pick} className="hidden" data-testid="receipt-gallery" />
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/40 bg-success-soft p-2">
          {url && !broken ? (
            <img src={url} alt="Bill preview" onError={() => setBroken(true)} className="h-16 w-16 rounded-lg object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-card text-muted-foreground"><FileImage className="h-7 w-7" aria-hidden /></div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-success-soft-foreground">Bill attached</p>
            <p className="truncate text-xs text-muted-foreground">{file.name}</p>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onScan} disabled={scanning}>
              {scanning ? <><Loader2 className="h-3 w-3 animate-spin" />Reading bill...</> : "Read bill to fill in"}
            </Button>
          </div>
          <button type="button" aria-label="Remove bill photo" onClick={() => onChange(null)} className="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-card">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className={tile} onClick={() => cameraRef.current?.click()}><Camera className="h-5 w-5" aria-hidden />Camera</button>
          <button type="button" className={tile} onClick={() => galleryRef.current?.click()}><ImageIcon className="h-5 w-5" aria-hidden />Gallery</button>
        </div>
      )}
    </div>
  );
}
