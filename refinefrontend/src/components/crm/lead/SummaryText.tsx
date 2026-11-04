import type { ReactNode } from "react";

/** **bold** spans as <strong>; everything else stays plain text, so no HTML is ever injected. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part,
  );
}

type Block = { kind: "p" | "ol" | "ul"; lines: string[] };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let afterBlank = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { afterBlank = true; continue; }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const kind = ol ? "ol" : ul ? "ul" : "p";
    const body = (ol ?? ul)?.[1] ?? line;
    const last = blocks[blocks.length - 1];
    // A blank line ends a paragraph but not a list: items separated by blank lines stay one list.
    if (last && last.kind === kind && (kind !== "p" || !afterBlank)) last.lines.push(body);
    else blocks.push({ kind, lines: [body] });
    afterBlank = false;
  }
  return blocks;
}

/** The AI summary: bold, paragraphs and numbered or bulleted lists, rendered as React elements. */
export function SummaryText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      {toBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="break-words">{b.lines.flatMap((l, j) => [j > 0 ? <br key={`b${j}`} /> : null, ...inline(l)])}</p>
        ) : b.kind === "ol" ? (
          <ol key={i} className="list-decimal space-y-0.5 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</ol>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul>
        ),
      )}
    </div>
  );
}
