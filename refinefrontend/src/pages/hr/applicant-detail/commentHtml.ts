import DOMPurify from "dompurify";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** react-mentions markup `@[Name](id)` to the Frappe mention span the backend stores. */
export function toFrappeHTML(value: string): string {
  return value.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_, display: string, id: string) => {
    const d = escapeHtml(display);
    return (
      `<span class="mention" data-id="${escapeHtml(id)}" data-value="${d}" data-denotation-char="@">` +
      `<span class="ql-mention-denotation-char">@</span>${d}</span>`
    );
  });
}

/**
 * Stored comment HTML to safe HTML. Parsed into an inert document (nothing is attached to the
 * live page), every mention span (Quill or flat shape) becomes <mark>@Name</mark> with the name
 * as text, then the result is sanitised with a tag allow-list and no attributes.
 */
export function commentToSafeHtml(content: string): string {
  const doc = new DOMParser().parseFromString(content.replace(/<br\s*\/?>/gi, "\n"), "text/html");
  // Outermost mention spans only; a nested span[data-value] would be replaced with its parent.
  doc.body.querySelectorAll("span[data-value]").forEach((span) => {
    if (!span.isConnected) return;
    const mark = doc.createElement("mark");
    mark.textContent = `@${span.getAttribute("data-value") ?? ""}`;
    span.replaceWith(mark);
  });
  return DOMPurify.sanitize(doc.body.innerHTML, {
    ALLOWED_TAGS: ["mark", "b", "strong", "i", "em", "u", "p", "div", "span", "ul", "ol", "li"],
    ALLOWED_ATTR: [],
  });
}
