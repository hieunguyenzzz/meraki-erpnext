import DOMPurify from "dompurify";

/** react-mentions markup `@[Name](id)` to the Frappe mention span the backend stores. */
export function toFrappeHTML(value: string): string {
  return value.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    (_, display, id) =>
      `<span class="mention" data-id="${id}" data-value="${display}" data-denotation-char="@">` +
      `<span class="ql-mention-denotation-char">@</span>${display}</span>`
  );
}

/**
 * Stored comment HTML to safe HTML. Mention spans become <mark>, then everything is
 * sanitised with a tag allow-list and no attributes (so stored content can't carry
 * classes, styles, links or handlers).
 */
export function commentToSafeHtml(content: string): string {
  // Mention spans come in two stored shapes: Quill (wrapper span + denotation span) and the
  // flat form the backend writes (`<span data-value=..><span>@</span>Name</span>`).
  const withMarks = content
    .replace(/<span[^>]*\bdata-value="([^"]+)"[^>]*>\s*<span[^>]*>[\s\S]*?<\/span>[^<]*<\/span>\s*<\/span>/g, "<mark>@$1</mark>")
    .replace(/<span[^>]*\bdata-value="([^"]+)"[^>]*>\s*<span[^>]*>@<\/span>[^<]*<\/span>/g, "<mark>@$1</mark>");
  const withBreaks = withMarks.replace(/<br\s*\/?>/gi, "\n");
  return DOMPurify.sanitize(withBreaks, {
    ALLOWED_TAGS: ["mark", "b", "strong", "i", "em", "u", "p", "div", "span", "ul", "ol", "li"],
    ALLOWED_ATTR: [],
  });
}
