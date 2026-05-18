import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useList, useUpdate, useDelete, useInvalidate } from "@refinedev/core";
import { ImagePlus, Star, X, ChevronLeft, ChevronRight, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { uploadFile } from "@/lib/fileUpload";
import type { VenueWeddingArea } from "@/lib/types";

interface VenueGalleryTabProps {
  venueName: string;
  areas: VenueWeddingArea[];
  currentCoverPhotoName?: string | null;
}

type UploadState = {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

interface FileRecord {
  name: string;
  file_url: string;
  file_name: string;
  creation: string;
  custom_caption?: string;
  custom_venue_area?: string;
}

// ─── Inline caption editor ─────────────────────────────────────────────────

function CaptionEditor({
  fileId,
  caption,
  onSaved,
}: {
  fileId: string;
  caption?: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caption ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { mutate: updateFile } = useUpdate();

  function save() {
    setSaveError(null);
    updateFile(
      {
        resource: "File",
        id: fileId,
        values: { custom_caption: draft },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => { setEditing(false); onSaved(); },
        onError: (err) => { setSaveError(err?.message ?? "Failed to save caption"); },
      }
    );
  }

  if (!editing) {
    return (
      <>
        {saveError && (
          <p className="text-xs text-destructive truncate" title={saveError}>
            {saveError}
          </p>
        )}
        <p
          className={`text-xs truncate cursor-pointer hover:text-foreground transition-colors ${
            caption ? "text-foreground" : "text-muted-foreground italic"
          }`}
          onClick={() => { setDraft(caption ?? ""); setSaveError(null); setEditing(true); }}
        >
          {caption || "Add caption…"}
        </p>
      </>
    );
  }

  return (
    <Input
      autoFocus
      className="h-6 text-xs px-1 py-0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

// ─── Area-tag popover ──────────────────────────────────────────────────────

function AreaTagPopover({
  fileId,
  currentArea,
  areas,
  onSaved,
  onError,
}: {
  fileId: string;
  currentArea?: string;
  areas: VenueWeddingArea[];
  onSaved: () => void;
  onError?: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { mutate: updateFile } = useUpdate();

  function pick(areaName: string | null) {
    updateFile(
      {
        resource: "File",
        id: fileId,
        values: { custom_venue_area: areaName ?? "" },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => { setOpen(false); onSaved(); },
        onError: (err) => { setOpen(false); onError?.(err?.message ?? "Failed to update area tag"); },
      }
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded font-medium leading-none transition-colors ${
            currentArea
              ? "bg-primary/80 text-primary-foreground hover:bg-primary"
              : "bg-black/50 text-white/80 hover:bg-black/70"
          }`}
        >
          {currentArea || "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        <button
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent text-muted-foreground italic"
          onClick={() => pick(null)}
        >
          (Untagged)
        </button>
        {areas.map((a) => (
          <button
            key={a.name}
            className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent ${
              currentArea === a.area_name ? "font-semibold" : ""
            }`}
            onClick={() => pick(a.area_name)}
          >
            {a.area_name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Confirm delete dialog ─────────────────────────────────────────────────

function ConfirmDeleteDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <p className="text-sm font-medium">Delete this photo?</p>
        <p className="text-sm text-muted-foreground">This cannot be undone.</p>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Per-photo thumbnail ────────────────────────────────────────────────────

function PhotoCard({
  file,
  isCover,
  areas,
  onSetCover,
  onDelete,
  onMetaChange,
  onClick,
}: {
  file: FileRecord;
  isCover: boolean;
  areas: VenueWeddingArea[];
  onSetCover: () => void;
  onDelete: () => void;
  onMetaChange: () => void;
  onClick: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <div className="aspect-square rounded overflow-hidden relative group bg-muted">
        {/* Main image — click opens lightbox */}
        <img
          src={file.file_url}
          alt={file.file_name}
          className="w-full h-full object-cover cursor-pointer"
          onClick={onClick}
        />

        {/* Cover star */}
        <button
          className="absolute top-1 left-1 z-10 p-0.5 rounded-full bg-black/30 hover:bg-black/50 transition-colors"
          title={isCover ? "Cover photo" : "Set as cover"}
          onClick={(e) => { e.stopPropagation(); onSetCover(); }}
        >
          <Star
            className={`h-4 w-4 ${
              isCover
                ? "fill-amber-400 text-amber-400"
                : "text-white/80"
            }`}
          />
        </button>

        {/* Delete button */}
        <button
          className="absolute top-1 right-1 z-10 p-0.5 rounded-full bg-black/30 hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete photo"
          onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
        >
          <X className="h-4 w-4 text-white" />
        </button>

        {/* Area tag */}
        <AreaTagPopover
          fileId={file.name}
          currentArea={file.custom_venue_area}
          areas={areas}
          onSaved={onMetaChange}
          onError={setCardError}
        />
      </div>

      {/* Card-level error (area tag or cover failures) */}
      {cardError && (
        <p
          className="text-xs text-destructive truncate cursor-pointer"
          title={cardError}
          onClick={() => setCardError(null)}
        >
          <XCircle className="inline h-3 w-3 mr-0.5" />
          {cardError}
        </p>
      )}

      {/* Caption */}
      <CaptionEditor
        fileId={file.name}
        caption={file.custom_caption}
        onSaved={onMetaChange}
      />

      <ConfirmDeleteDialog
        open={confirmOpen}
        onConfirm={() => { setConfirmOpen(false); onDelete(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ─── Lightbox ──────────────────────────────────────────────────────────────

function Lightbox({
  images,
  index,
  coverName,
  onClose,
  onNavigate,
  onSetCover,
  onDelete,
}: {
  images: FileRecord[];
  index: number;
  coverName?: string | null;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onSetCover: (file: FileRecord) => void;
  onDelete: (file: FileRecord) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const file = images[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")
        onNavigate((index - 1 + images.length) % images.length);
      if (e.key === "ArrowRight")
        onNavigate((index + 1) % images.length);
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNavigate]);

  if (!file) return null;

  const isCover = file.name === coverName;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl p-0 bg-black/95 border-none overflow-hidden">
        <div className="relative flex flex-col items-center">
          {/* Area badge */}
          {file.custom_venue_area && (
            <div className="absolute top-3 left-3 z-10">
              <Badge className="bg-black/60 text-white border-none text-xs">
                {file.custom_venue_area}
              </Badge>
            </div>
          )}

          {/* Image */}
          <div className="relative flex items-center justify-center min-h-[400px] w-full">
            <img
              src={file.file_url}
              alt={file.file_name}
              className="max-h-[80vh] max-w-full object-contain"
            />

            {images.length > 1 && (
              <>
                <button
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition-colors"
                  onClick={() =>
                    onNavigate((index - 1 + images.length) % images.length)
                  }
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition-colors"
                  onClick={() =>
                    onNavigate((index + 1) % images.length)
                  }
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/50 rounded-full px-3 py-1">
                  {index + 1} / {images.length}
                </div>
              </>
            )}
          </div>

          {/* Caption + toolbar */}
          <div className="w-full px-4 py-3 flex items-center justify-between gap-4 bg-black/80">
            <p className="text-sm text-white/80 truncate flex-1">
              {file.custom_caption || (
                <span className="italic text-white/40">No caption</span>
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {!isCover && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-white/30 text-white hover:bg-white/10 hover:text-white bg-transparent"
                  onClick={() => onSetCover(file)}
                >
                  <Star className="h-3 w-3 mr-1" />
                  Set as cover
                </Button>
              )}
              {isCover && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400" />
                  Cover
                </span>
              )}
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={() => setConfirmOpen(true)}
              >
                <X className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        <ConfirmDeleteDialog
          open={confirmOpen}
          onConfirm={() => { setConfirmOpen(false); onDelete(file); }}
          onCancel={() => setConfirmOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload progress strip ─────────────────────────────────────────────────

function UploadStrip({ uploads }: { uploads: UploadState[] }) {
  if (uploads.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 py-2">
      {uploads.map((u) => (
        <span
          key={u.name}
          className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
            u.status === "done"
              ? "bg-green-50 border-green-200 text-green-700"
              : u.status === "error"
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : u.status === "uploading"
              ? "bg-primary/10 border-primary/20 text-primary animate-pulse"
              : "bg-muted border-muted-foreground/20 text-muted-foreground"
          }`}
        >
          {u.name}{" "}
          {u.status === "uploading"
            ? "↑"
            : u.status === "done"
            ? "✓"
            : u.status === "error"
            ? "✕"
            : "…"}
        </span>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function VenueGalleryTab({
  venueName,
  areas,
  currentCoverPhotoName,
}: VenueGalleryTabProps) {
  const invalidate = useInvalidate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [areaFilter, setAreaFilter] = useState<string>("__all__");
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showGalleryError(msg: string) {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setGalleryError(msg);
    errorTimerRef.current = setTimeout(() => setGalleryError(null), 6000);
  }

  const { mutate: deleteFile } = useDelete();
  const { mutate: updateSupplier } = useUpdate();

  // Track the latest cover so async callbacks (delete onSuccess) see the
  // current value even if the prop updated mid-flight from a concurrent
  // setCover. Closure-captured `currentCoverPhotoName` would be stale.
  const coverRef = useRef(currentCoverPhotoName);
  useEffect(() => {
    coverRef.current = currentCoverPhotoName;
  }, [currentCoverPhotoName]);

  // ── Fetch photos ──────────────────────────────────────────────────────────
  const { result, query } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [
      { field: "attached_to_doctype", operator: "eq", value: "Supplier" },
      { field: "attached_to_name", operator: "eq", value: venueName },
    ],
    meta: {
      fields: [
        "name",
        "file_url",
        "file_name",
        "creation",
        "custom_caption",
        "custom_venue_area",
      ],
    },
  });

  const images = useMemo(
    () =>
      ((result?.data ?? []) as FileRecord[]).filter((f) =>
        /\.(jpg|jpeg|png|webp)$/i.test(f.file_url ?? "")
      ),
    [result?.data]
  );

  // ── Stale-tag detection ───────────────────────────────────────────────────
  const areaNames = useMemo(
    () => new Set(areas.map((a) => a.area_name).filter(Boolean)),
    [areas]
  );

  const staleTagged = useMemo(
    () =>
      images.filter(
        (f) => f.custom_venue_area && !areaNames.has(f.custom_venue_area)
      ),
    [images, areaNames]
  );

  // ── Filtered view ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (areaFilter === "__all__") return images;
    if (areaFilter === "__none__")
      return images.filter((f) => !f.custom_venue_area);
    if (areaFilter === "__stale__") return staleTagged;
    return images.filter((f) => f.custom_venue_area === areaFilter);
  }, [images, areaFilter, staleTagged]);

  // ── Invalidation helper ───────────────────────────────────────────────────
  const refreshFiles = useCallback(() => {
    invalidate({ resource: "File", invalidates: ["list"] });
  }, [invalidate]);

  const refreshSupplier = useCallback(() => {
    invalidate({ resource: "Supplier", invalidates: ["detail"] });
  }, [invalidate]);

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const fileArray = Array.from(files);

      const initial: UploadState[] = fileArray.map((f) => ({
        name: f.name,
        status: "pending",
      }));
      setUploads(initial);

      for (let i = 0; i < fileArray.length; i++) {
        const f = fileArray[i];
        setUploads((prev) =>
          prev.map((u, idx) =>
            idx === i ? { ...u, status: "uploading" } : u
          )
        );
        try {
          await uploadFile(f, "Supplier", venueName, false);
          setUploads((prev) =>
            prev.map((u, idx) =>
              idx === i ? { ...u, status: "done" } : u
            )
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setUploads((prev) =>
            prev.map((u, idx) =>
              idx === i ? { ...u, status: "error", error: msg } : u
            )
          );
        }
      }

      // Clear after a short delay so staff can see the final states
      setTimeout(() => {
        setUploads([]);
        refreshFiles();
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 1500);
    },
    [venueName, refreshFiles]
  );

  // ── Drag-drop ─────────────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave() {
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── Cover actions ──────────────────────────────────────────────────────────
  function setCover(file: FileRecord) {
    updateSupplier(
      {
        resource: "Supplier",
        id: venueName,
        values: { custom_cover_photo: file.name },
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: refreshSupplier,
        onError: (err) => showGalleryError(err?.message ?? "Failed to set cover photo"),
      }
    );
  }

  // ── Delete action ─────────────────────────────────────────────────────────
  function handleDelete(file: FileRecord) {
    deleteFile(
      {
        resource: "File",
        id: file.name,
        successNotification: false,
        errorNotification: false,
      },
      {
        onSuccess: () => {
          // Read latest cover at completion time, not at click time —
          // covers the case where a concurrent setCover updated the prop
          // between this user clicking delete and the API returning.
          if (file.name === coverRef.current) {
            updateSupplier({
              resource: "Supplier",
              id: venueName,
              values: { custom_cover_photo: null },
              successNotification: false,
              errorNotification: false,
            });
            refreshSupplier();
          }
          // Adjust lightbox index if needed
          if (lightboxOpen) {
            const newImages = images.filter((f) => f.name !== file.name);
            if (newImages.length === 0) {
              setLightboxOpen(false);
            } else {
              setLightboxIndex((i) => Math.min(i, newImages.length - 1));
            }
          }
          refreshFiles();
        },
        onError: (err) => showGalleryError(err?.message ?? "Failed to delete photo"),
      }
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All areas</SelectItem>
            <SelectItem value="__none__">(Untagged)</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a.name} value={a.area_name}>
                {a.area_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-sm text-muted-foreground flex-1">
          {filtered.length} photo{filtered.length === 1 ? "" : "s"}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4 mr-1.5" />
          Upload
        </Button>
      </div>

      {/* Gallery-level error banner (delete / cover / area-tag failures) */}
      {galleryError && (
        <div
          className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm flex items-center justify-between gap-3 cursor-pointer"
          onClick={() => setGalleryError(null)}
        >
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{galleryError}</span>
          </div>
          <span className="text-xs text-destructive/70 shrink-0">Click to dismiss</span>
        </div>
      )}

      {/* Stale-tag banner */}
      {staleTagged.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {staleTagged.length} photo
              {staleTagged.length === 1 ? "" : "s"} reference areas that no
              longer exist.
            </span>
          </div>
          <Button
            variant="link"
            size="sm"
            className="shrink-0 text-amber-800 underline p-0 h-auto"
            onClick={() => setAreaFilter("__stale__")}
          >
            Show them
          </Button>
        </div>
      )}

      {/* Upload progress strip */}
      <UploadStrip uploads={uploads} />

      {/* Grid / empty state */}
      {query.isLoading ? (
        <div className="text-sm text-muted-foreground py-4">
          Loading photos…
        </div>
      ) : images.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-16 gap-3 cursor-pointer text-muted-foreground hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-10 w-10" />
          <p className="text-sm">No photos yet. Upload the first one.</p>
        </div>
      ) : (
        <div
          className={`relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 rounded-lg transition-colors ${
            dragOver ? "outline outline-2 outline-primary bg-primary/5" : ""
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {dragOver && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
              <p className="text-sm font-medium text-primary">
                Drop photos here
              </p>
            </div>
          )}

          {filtered.map((file, idx) => (
            <PhotoCard
              key={file.name}
              file={file}
              isCover={file.name === currentCoverPhotoName}
              areas={areas}
              onSetCover={() => setCover(file)}
              onDelete={() => handleDelete(file)}
              onMetaChange={refreshFiles}
              onClick={() => {
                // Find index in full images array for consistent keyboard nav
                const globalIdx = images.findIndex((f) => f.name === file.name);
                setLightboxIndex(globalIdx >= 0 ? globalIdx : idx);
                setLightboxOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && images.length > 0 && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          coverName={currentCoverPhotoName}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setLightboxIndex}
          onSetCover={(file) => { setCover(file); }}
          onDelete={(file) => { handleDelete(file); }}
        />
      )}
    </div>
  );
}
