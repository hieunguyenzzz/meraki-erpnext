const API_BASE = "/api";

export async function uploadFile(
  file: File,
  doctype: string,
  docname: string,
  isPrivate = true
): Promise<{ file_url: string; name: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("doctype", doctype);
  formData.append("docname", docname);
  formData.append("is_private", isPrivate ? "1" : "0");

  const res = await fetch(`${API_BASE}/method/upload_file`, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Frappe-Site-Name": "erp.merakiwp.com",
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed ${res.status}: ${text}`);
  }

  const json = await res.json();
  return { file_url: json.message.file_url, name: json.message.name };
}

/** Attach a receipt to a Purchase Invoice via the backend (planners lack ERPNext PI permissions). */
export async function attachExpenseReceipt(
  file: File,
  piName: string,
  { replace = false, isPrivate = false }: { replace?: boolean; isPrivate?: boolean } = {}
): Promise<{ file_url: string; warning?: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (replace) formData.append("replace", "true");
  if (isPrivate) formData.append("is_private", "true");

  const res = await fetch(`/inquiry-api/expense/${encodeURIComponent(piName)}/attach`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Receipt upload failed (${res.status})`);
  }
  return res.json();
}

/** Delete all receipts attached to a Purchase Invoice via the backend. */
export async function deleteExpenseReceipt(piName: string): Promise<{ deleted: number }> {
  const res = await fetch(`/inquiry-api/expense/${encodeURIComponent(piName)}/receipt`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Receipt delete failed (${res.status})`);
  }
  return res.json();
}
