export interface ExpenseCategory {
  name: string;
  account_name: string;
}

export interface ScanResult {
  amount?: number | null;
  description?: string | null;
  date?: string | null;
  category?: string | null;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({}));
  return new Error(typeof data.detail === "string" ? data.detail : `${fallback} (${res.status})`);
}

export async function fetchCategories(withWedding: boolean, signal: AbortSignal): Promise<ExpenseCategory[]> {
  const res = await fetch(`/inquiry-api/expense/categories${withWedding ? "?scope=wedding" : ""}`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) throw await failure(res, "Could not load categories");
  return res.json();
}

export async function scanBill(file: File): Promise<ScanResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/inquiry-api/expense/scan-bill", { method: "POST", body: fd, credentials: "include" });
  if (!res.ok) throw await failure(res, "Could not read the bill");
  return res.json();
}

export interface ExpenseInput {
  project: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  note: string;
  staff: string;
  receipt: File | null;
}

/** One request creates the draft Purchase Invoice and attaches the receipt. */
export async function submitExpense(v: ExpenseInput): Promise<{ name: string; receipt_attached?: boolean }> {
  const fd = new FormData();
  fd.append("project", v.project);
  fd.append("date", v.date);
  fd.append("description", v.description);
  fd.append("amount", String(v.amount));
  fd.append("category", v.category);
  fd.append("staff", v.staff);
  fd.append("note", v.note.trim());
  if (v.receipt) fd.append("receipt", v.receipt);
  const res = await fetch("/inquiry-api/expense/wedding-with-receipt", { method: "POST", body: fd, credentials: "include" });
  if (!res.ok) throw await failure(res, "Could not save the expense");
  return res.json();
}
