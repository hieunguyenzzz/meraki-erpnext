import { useMemo } from "react";
import DOMPurify from "dompurify";

/**
 * Preview of an email template. The HTML is sanitised with DOMPurify (which parses it in an
 * inert document) and then shown in a script-less sandboxed iframe, so a template can never
 * run code or restyle the admin app. Jinja placeholders appear as written.
 */
export function TemplatePreview({ html }: { html: string }) {
  const safe = useMemo(
    () => DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "form", "input", "button"], FORBID_ATTR: ["style"] }),
    [html],
  );
  const srcDoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><body style="font-family:sans-serif;font-size:14px;margin:12px">${safe}`;
  return (
    <iframe
      title="Email preview"
      sandbox=""
      srcDoc={srcDoc}
      className="h-72 w-full rounded-input border border-input bg-white"
    />
  );
}
