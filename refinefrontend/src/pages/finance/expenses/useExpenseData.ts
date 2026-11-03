import { useCallback, useEffect, useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { responseError, type Expense, type ExpenseCategory, type RowInfo } from "./types";

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|$)/i;

export interface Receipt {
  url: string;
  isImage: boolean;
}

/** Fetch a JSON endpoint once, keeping failures visible (error string + console). */
function useJson<T>(url: string, empty: T, label: string) {
  const [data, setData] = useState<T>(empty);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw await responseError(r, label);
        return r.json() as Promise<T>;
      })
      .then((d) => { setData(d); setError(null); })
      .catch((err: unknown) => {
        console.error(`${label} failed`, err);
        setError(err instanceof Error ? err.message : label);
      });
  }, [url, label]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

/** Everything the expenses list shows, in one place. */
export function useExpenseData() {
  const { result, query } = useList({
    resource: "Purchase Invoice",
    pagination: { mode: "off" },
    sorters: [{ field: "posting_date", order: "desc" }],
    meta: {
      fields: [
        "name", "supplier", "supplier_name", "posting_date", "grand_total", "status",
        "docstatus", "custom_rejected", "against_expense_account", "project",
      ],
    },
  });
  const { result: projectsResult } = useList({
    resource: "Project",
    pagination: { mode: "off" },
    meta: { fields: ["name", "project_name", "expected_end_date"] },
  });
  const { result: filesResult, query: filesQuery } = useList({
    resource: "File",
    pagination: { mode: "off" },
    filters: [{ field: "attached_to_doctype", operator: "eq", value: "Purchase Invoice" }],
    meta: { fields: ["attached_to_name", "file_url", "is_private"] },
  });
  const info = useJson<Record<string, RowInfo>>("/inquiry-api/expense/descriptions", {}, "Expense descriptions");
  const categories = useJson<ExpenseCategory[]>("/inquiry-api/expense/categories", [], "Expense categories");

  const expenses = useMemo(() => (result?.data ?? []) as Expense[], [result]);
  const projects = useMemo(
    () => (projectsResult?.data ?? []) as { name: string; project_name: string; expected_end_date?: string }[],
    [projectsResult],
  );
  const weddingNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects) m[p.name] = p.project_name;
    return m;
  }, [projects]);
  const allWeddings = useMemo(
    () => projects.map((p) => ({ value: p.name, label: p.project_name, sub: p.expected_end_date?.slice(0, 10) })),
    [projects],
  );

  const receipts = useMemo(() => {
    const m: Record<string, Receipt> = {};
    for (const f of (filesResult?.data ?? []) as { attached_to_name: string; file_url: string | null; is_private: number }[]) {
      if (!f.file_url) continue;
      const url = f.is_private ? `/api/method/frappe.utils.file_manager.download_file?file_url=${encodeURIComponent(f.file_url)}` : f.file_url;
      const next = { url, isImage: IMAGE.test(f.file_url) };
      const cur = m[f.attached_to_name];
      if (!cur || (!cur.isImage && next.isImage)) m[f.attached_to_name] = next;
    }
    return m;
  }, [filesResult]);

  return {
    expenses,
    loading: query.isLoading,
    error: query.isError && expenses.length === 0 ? query.error : null,
    refetch: () => void query.refetch(),
    weddingNames,
    allWeddings,
    info: info.data,
    infoError: info.error,
    reloadInfo: info.reload,
    categories: categories.data,
    reloadCategories: categories.reload,
    receipts,
    receiptsKnown: !filesQuery.isLoading && !filesQuery.isError,
  };
}
