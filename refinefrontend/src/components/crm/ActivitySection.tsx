import { useState } from "react";
import DOMPurify from "dompurify";
import { Mail, MailOpen, RefreshCw, StickyNote, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NoteForm } from "./NoteForm";
import { useActivityItems, type NoteRef } from "./useActivityItems";

interface ActivitySectionProps {
  references: NoteRef[];
}

// Helper to strip HTML tags and get plain text for preview
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

const PREVIEW_LENGTH = 150;

interface EmailContentProps {
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function EmailContent({ content, isExpanded, onToggle }: EmailContentProps) {
  const plainText = stripHtml(content);
  const needsTruncation = plainText.length > PREVIEW_LENGTH;

  if (!needsTruncation) {
    // Short content - show full HTML, no toggle needed
    return (
      <div
        className="text-sm prose prose-sm max-w-none mt-2"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
      />
    );
  }

  if (isExpanded) {
    // Expanded - show full HTML content
    return (
      <div className="mt-2">
        <div
          className="text-sm prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
        />
        <button
          onClick={onToggle}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ChevronUp className="h-3 w-3" />
          Show less
        </button>
      </div>
    );
  }

  // Collapsed - show plain text preview
  const preview = plainText.slice(0, PREVIEW_LENGTH).trim() + "...";
  return (
    <div className="mt-2">
      <p className="text-sm text-muted-foreground">{preview}</p>
      <button
        onClick={onToggle}
        className="mt-1 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ChevronDown className="h-3 w-3" />
        Show more
      </button>
    </div>
  );
}

function ActivityFeed({ references }: ActivitySectionProps) {
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const { items } = useActivityItems(references);

  function toggleEmailExpanded(id: string) {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No activity yet. Add a note or send an email to start.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        let borderColor = "border-muted";
        let icon = <StickyNote className="h-4 w-4" />;
        let label = "Note";
        let bgColor = "bg-muted/30";

        switch (item.type) {
          case "email_sent":
            borderColor = "border-green-500";
            bgColor = "bg-green-50 dark:bg-green-950/30";
            icon = <Mail className="h-4 w-4 text-green-600" />;
            label = "Email Sent";
            break;
          case "email_received":
            borderColor = "border-blue-500";
            bgColor = "bg-blue-50 dark:bg-blue-950/30";
            icon = <MailOpen className="h-4 w-4 text-blue-600" />;
            label = "Email Received";
            break;
          case "stage_change":
            borderColor = "border-gray-400";
            bgColor = "bg-gray-50 dark:bg-gray-900/30";
            icon = <RefreshCw className="h-4 w-4 text-gray-500" />;
            label = "Stage Changed";
            break;
          case "note":
            borderColor = "border-yellow-500";
            bgColor = "bg-yellow-50 dark:bg-yellow-950/30";
            icon = <StickyNote className="h-4 w-4 text-yellow-600" />;
            label = "Note";
            break;
        }

        const isEmail = item.type === "email_sent" || item.type === "email_received";

        return (
          <div key={item.id} className={cn("border-l-2 rounded-r-md p-3", borderColor, bgColor)}>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {icon}
              <span className="font-medium">{label}</span>
              {item.subject && (
                <>
                  <span className="text-muted-foreground">&middot;</span>
                  <span className="text-muted-foreground truncate max-w-[200px]">{item.subject}</span>
                </>
              )}
              {item.author && (
                <>
                  <span className="text-muted-foreground">&middot;</span>
                  <span className="text-muted-foreground">{item.author}</span>
                </>
              )}
              <span className="text-muted-foreground ml-auto text-xs">{formatDateTime(item.creation)}</span>
            </div>
            {isEmail ? (
              <EmailContent
                content={item.content}
                isExpanded={expandedEmails.has(item.id)}
                onToggle={() => toggleEmailExpanded(item.id)}
              />
            ) : (
              <div
                className="text-sm text-muted-foreground prose prose-sm max-w-none mt-1"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content) }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ActivitySection({ references }: ActivitySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <NoteForm primaryRef={references[0]} />

        <Separator />

        <ActivityFeed references={references} />
      </CardContent>
    </Card>
  );
}

// Keep backwards compatibility - export the old name too
export { ActivitySection as InternalNotesSection };
