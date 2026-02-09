import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Copy, RefreshCw, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationRef {
  doctype: string;
  docName: string;
}

interface SuggestedResponseProps {
  leadName: string;
  references: ConversationRef[];
  weddingDate?: string;
  venue?: string;
  budget?: string;
  guestCount?: string;
}

interface Communication {
  direction: "Sent" | "Received";
  content: string;
  date: string;
  subject?: string;
}

interface SuggestResponseResult {
  suggested_response: string;
  tools_used: string[];
  follow_up_questions: string[];
}

// Tone options for response generation
const TONE_OPTIONS = [
  { value: "professional", label: "Professional", description: "Polished and business-appropriate" },
  { value: "warm", label: "Warm & Friendly", description: "Personable and approachable" },
  { value: "concise", label: "Concise", description: "Brief and to the point" },
  { value: "detailed", label: "Detailed", description: "Comprehensive with full context" },
] as const;

type ToneValue = typeof TONE_OPTIONS[number]["value"];

// Wedding planner agent URL - uses relative path in production (via nginx proxy)
const PLANNER_API_URL = "/planner-api";

// Fetch communications linked via reference_doctype/reference_name fields
function useTimelineLinkedConversations(ref: ConversationRef) {
  return useQuery({
    queryKey: ["suggested-response-communications", ref.doctype, ref.docName],
    queryFn: async () => {
      if (!ref.docName || ref.docName === "__none__") return [];
      const params = new URLSearchParams({
        doctype: "Communication",
        fields: JSON.stringify([
          "name", "subject", "content", "communication_medium",
          "sender", "creation", "sent_or_received", "communication_date",
        ]),
        filters: JSON.stringify([
          ["reference_doctype", "=", ref.doctype],
          ["reference_name", "=", ref.docName],
        ]),
        order_by: "creation desc",
        limit_page_length: "50",
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.message ?? []) as Array<{
        name: string;
        subject?: string;
        content: string;
        communication_medium: string;
        sender: string;
        creation: string;
        sent_or_received: string;
        communication_date?: string;
      }>;
    },
    enabled: !!ref.docName && ref.docName !== "__none__",
  });
}

export function SuggestedResponseSection({
  leadName,
  references,
  weddingDate,
  venue,
  budget,
  guestCount,
}: SuggestedResponseProps) {
  const [suggestion, setSuggestion] = useState<SuggestResponseResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [tone, setTone] = useState<ToneValue>("warm");

  const ref0 = references[0];
  const ref1 = references.length > 1 ? references[1] : null;

  // Fetch communications from both references
  const { data: comms0 = [], isLoading: loading0 } = useTimelineLinkedConversations(ref0);
  const { data: comms1 = [], isLoading: loading1 } = useTimelineLinkedConversations(
    ref1 ?? { doctype: "__none__", docName: "__none__" }
  );

  // Combine and deduplicate communications
  const communications = useMemo<Communication[]>(() => {
    const all: Communication[] = [];
    const seen = new Set<string>();

    function addItem(c: any) {
      if (seen.has(c.name)) return;
      seen.add(c.name);
      all.push({
        direction: c.sent_or_received === "Sent" ? "Sent" : "Received",
        content: c.content ?? "",
        date: c.communication_date || c.creation,
        subject: c.subject || undefined,
      });
    }

    for (const c of comms0) addItem(c);
    for (const c of comms1) addItem(c);

    // Sort by date (newest first)
    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return all;
  }, [comms0, comms1]);

  const { mutate: generateSuggestion, isPending, error } = useMutation({
    mutationFn: async (): Promise<SuggestResponseResult> => {
      const response = await fetch(`${PLANNER_API_URL}/suggest-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_name: leadName,
          communications: communications.map((c) => ({
            direction: c.direction,
            content: c.content,
            date: c.date,
            subject: c.subject,
          })),
          wedding_date: weddingDate,
          venue,
          budget,
          guest_count: guestCount,
          tone, // Pass tone to the API
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to generate suggestion: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSuggestion(data);
    },
  });

  const handleCopy = async () => {
    if (suggestion?.suggested_response) {
      await navigator.clipboard.writeText(suggestion.suggested_response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Don't show while loading or if no communications
  if (loading0 || loading1) {
    return null;
  }

  if (communications.length === 0) {
    return null;
  }

  // Only show if the most recent communication is from the client (awaiting staff response)
  const lastComm = communications[0];
  const isAwaitingStaffResponse = lastComm?.direction === "Received";

  if (!isAwaitingStaffResponse) {
    return null;
  }

  // Initial state - show generate button with tone selector
  if (!suggestion && !isPending) {
    return (
      <Card className="mt-4">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Tone selector */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Tone:</span>
              <Select value={tone} onValueChange={(v) => setTone(v as ToneValue)}>
                <SelectTrigger className="w-[160px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span>{option.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Generate button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateSuggestion()}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Suggest Response
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isPending) {
    return (
      <Card className="mt-4">
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Generating response...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Result state
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Suggested Response
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                Failed to generate suggestion. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateSuggestion()}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          ) : suggestion ? (
            <div className="space-y-4">
              {/* Tools used indicator */}
              {suggestion.tools_used.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.tools_used.map((tool, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                    >
                      {tool.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}

              {/* Suggested response */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {suggestion.suggested_response}
                </p>
              </div>

              {/* Follow-up questions */}
              {suggestion.follow_up_questions.length > 0 && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Suggested follow-ups
                  </span>
                  <ul className="mt-2 space-y-1">
                    {suggestion.follow_up_questions.map((q, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="mt-1">•</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className={cn(
                    "transition-colors",
                    copied && "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300"
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </>
                  )}
                </Button>

                {/* Tone selector for regeneration */}
                <div className="flex items-center gap-2">
                  <Select value={tone} onValueChange={(v) => setTone(v as ToneValue)}>
                    <SelectTrigger className="w-[140px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateSuggestion()}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
