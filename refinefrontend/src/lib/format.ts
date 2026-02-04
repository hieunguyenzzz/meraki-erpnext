export function formatVND(amount: number | undefined | null): string {
  if (amount == null) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | undefined | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format datetime for fields stored in server local time (e.g., creation) */
export function formatDateTime(date: string | undefined | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format datetime for fields stored in UTC (e.g., communication_date from email headers) */
export function formatDateTimeUTC(date: string | undefined | null): string {
  if (!date) return "-";
  // Append 'Z' to treat as UTC, then convert to Vietnam time
  const utcDate = date.includes("Z") || date.includes("+") ? date : date.replace(" ", "T") + "Z";
  return new Date(utcDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
