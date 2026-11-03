/** `tel:` link for a phone number typed any way ("0901 234.567", "+84 (90) 123-4567"); null when there are no digits. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
}
