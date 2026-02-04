import { useRef, useState } from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { uploadFile } from "@/lib/fileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileAttachments({
  doctype,
  docname,
}: {
  doctype: string;
  docname: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const invalidate = useInvalidate();

  const { result, query } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [
      { field: "attached_to_doctype", operator: "eq", value: doctype },
      { field: "attached_to_name", operator: "eq", value: docname },
    ],
    meta: {
      fields: ["name", "file_name", "file_url", "file_size", "is_private", "creation"],
    },
  });

  const files = result?.data ?? [];

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file, doctype, docname);
      invalidate({ resource: "File", invalidates: ["list"] });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Attachments ({files.length})</CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading..." : "Upload File"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : files.length === 0 ? (
          <p className="text-muted-foreground text-sm">No attachments</p>
        ) : (
          <div className="space-y-2">
            {files.map((f: any) => (
              <div key={f.name} className="flex items-center justify-between text-sm">
                <a
                  href={f.is_private
                    ? `/api/method/frappe.utils.file_manager.download_file?file_url=${encodeURIComponent(f.file_url)}`
                    : f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate max-w-[70%]"
                >
                  {f.file_name}
                </a>
                <span className="text-muted-foreground">
                  {formatFileSize(f.file_size ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
