import type { ExpenseRow } from "./types";

const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Download the rows on screen as a CSV (ISO dates, raw VND amounts so a spreadsheet can sum them). */
export function exportExpensesCsv(rows: ExpenseRow[], filename: string) {
  const head = ["Date", "Wedding", "Category", "Description", "Staff", "Amount (VND)", "Status"];
  const body = rows.map((r) => [r.posting_date.slice(0, 10), r.project_name, r.category_label, r.description, r.staff_name, Math.round(r.amount), r.status]);
  const csv = [head, ...body].map((line) => line.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
