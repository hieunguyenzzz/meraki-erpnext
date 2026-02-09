import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

// Wedding planner agent URL - uses relative path in production (via nginx proxy)
// For local development, the nginx config proxies /planner-api to the planner service
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

// Animated sparkle component
function AnimatedSparkles({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Sparkles className="h-5 w-5 relative z-10" />
      {/* Floating sparkle particles */}
      <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-amber-300 animate-ping opacity-75" />
      <span className="absolute -bottom-0.5 -left-1 h-1 w-1 rounded-full bg-rose-300 animate-ping opacity-75 animation-delay-300" />
      <span className="absolute top-0 -left-2 h-1 w-1 rounded-full bg-amber-200 animate-ping opacity-60 animation-delay-500" />
    </div>
  );
}

// Magical AI button with gradient and glow
function MagicButton({
  onClick,
  disabled,
  children
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative overflow-hidden",
        "px-6 py-3 rounded-xl",
        "font-medium text-sm tracking-wide",
        "transition-all duration-500 ease-out",
        "hover:scale-[1.02] active:scale-[0.98]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
        // Gradient background
        "bg-gradient-to-r from-rose-400 via-amber-300 to-rose-400",
        "bg-[length:200%_100%]",
        "hover:bg-[position:100%_0]",
        // Text
        "text-rose-950",
        // Shadow and glow
        "shadow-lg shadow-rose-200/50 dark:shadow-rose-900/30",
        "hover:shadow-xl hover:shadow-amber-200/60 dark:hover:shadow-amber-800/40",
      )}
    >
      {/* Shimmer effect overlay */}
      <span
        className={cn(
          "absolute inset-0 -translate-x-full",
          "bg-gradient-to-r from-transparent via-white/40 to-transparent",
          "group-hover:translate-x-full transition-transform duration-1000 ease-out",
          "skew-x-12"
        )}
      />

      {/* Subtle noise texture */}
      <span
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center justify-center gap-2.5">
        {children}
      </span>

      {/* Bottom highlight line */}
      <span
        className={cn(
          "absolute bottom-0 left-1/2 -translate-x-1/2",
          "w-0 h-0.5 rounded-full",
          "bg-gradient-to-r from-transparent via-white/80 to-transparent",
          "group-hover:w-3/4 transition-all duration-500 ease-out"
        )}
      />
    </button>
  );
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
  // This implements the "Awaiting staff" logic - only suggest when staff needs to reply
  const lastComm = communications[0]; // Already sorted newest first
  const isAwaitingStaffResponse = lastComm?.direction === "Received";

  if (!isAwaitingStaffResponse) {
    return null;
  }

  // Show magical button to trigger suggestion if not generated yet
  if (!suggestion && !isPending) {
    return (
      <div className="mt-6 relative">
        {/* Decorative elements */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-32 bg-gradient-to-r from-rose-100/50 via-amber-100/50 to-rose-100/50 dark:from-rose-950/30 dark:via-amber-950/30 dark:to-rose-950/30 rounded-full blur-3xl" />
        </div>

        {/* Card container */}
        <div
          className={cn(
            "relative rounded-2xl p-8",
            "bg-gradient-to-br from-rose-50/80 via-white to-amber-50/80",
            "dark:from-rose-950/40 dark:via-gray-900/80 dark:to-amber-950/40",
            "border border-rose-200/60 dark:border-rose-800/40",
            "shadow-sm"
          )}
        >
          {/* Corner accents */}
          <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-rose-300/50 dark:border-rose-700/50 rounded-tl-lg" />
          <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-amber-300/50 dark:border-amber-700/50 rounded-tr-lg" />
          <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-amber-300/50 dark:border-amber-700/50 rounded-bl-lg" />
          <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-rose-300/50 dark:border-rose-700/50 rounded-br-lg" />

          <div className="flex flex-col items-center gap-4 relative z-10">
            {/* Label */}
            <div className="flex items-center gap-2 text-rose-600/80 dark:text-rose-400/80">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-rose-300 dark:to-rose-700" />
              <span className="text-xs uppercase tracking-[0.2em] font-medium">AI Assistant</span>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-rose-300 dark:to-rose-700" />
            </div>

            {/* Main button */}
            <MagicButton onClick={() => generateSuggestion()}>
              <AnimatedSparkles />
              <span>Craft Response with Mai</span>
            </MagicButton>

            {/* Subtitle */}
            <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
              Let Mai, your AI wedding planner, suggest a personalized response
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state with elegant animation
  if (isPending) {
    return (
      <Card className="mt-4 border-rose-200/60 dark:border-rose-800/40 bg-gradient-to-br from-rose-50/50 to-amber-50/50 dark:from-rose-950/20 dark:to-amber-950/20 overflow-hidden">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-4">
            {/* Animated loader */}
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-rose-200 dark:border-rose-800" />
              <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-rose-400 dark:border-t-rose-500 animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-rose-400 dark:text-rose-500 animate-pulse" />
            </div>

            {/* Loading text with typing animation */}
            <div className="text-sm text-rose-600/80 dark:text-rose-400/80 font-medium">
              Mai is crafting your response
              <span className="inline-flex w-6 justify-start">
                <span className="animate-[bounce_1s_infinite_0ms]">.</span>
                <span className="animate-[bounce_1s_infinite_200ms]">.</span>
                <span className="animate-[bounce_1s_infinite_400ms]">.</span>
              </span>
            </div>

            {/* Progress shimmer bar */}
            <div className="w-48 h-1 rounded-full bg-rose-100 dark:bg-rose-900/50 overflow-hidden">
              <div
                className="h-full w-1/3 rounded-full bg-gradient-to-r from-rose-300 via-amber-300 to-rose-300 animate-[shimmer_1.5s_infinite]"
                style={{
                  backgroundSize: '200% 100%',
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-rose-200/60 dark:border-rose-800/40 bg-gradient-to-br from-rose-50/30 to-amber-50/30 dark:from-rose-950/20 dark:to-amber-950/20 mt-4 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-amber-400 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-rose-600 to-amber-600 dark:from-rose-400 dark:to-amber-400 bg-clip-text text-transparent font-semibold">
              Mai's Suggested Response
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-rose-100 dark:hover:bg-rose-900/30"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-rose-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-rose-500" />
            )}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                Failed to generate suggestion. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateSuggestion()}
                className="border-rose-300 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-950"
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
                      className="text-xs px-2.5 py-1 rounded-full bg-gradient-to-r from-rose-100 to-amber-100 dark:from-rose-900/50 dark:to-amber-900/50 text-rose-700 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/50"
                    >
                      {tool.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}

              {/* Suggested response */}
              <div className="relative">
                {/* Quote mark decoration */}
                <span className="absolute -top-2 -left-1 text-4xl text-rose-200 dark:text-rose-800 font-serif leading-none select-none">"</span>
                <div className="bg-white dark:bg-gray-900 rounded-xl p-4 pl-6 border border-rose-100 dark:border-rose-900/50 shadow-sm">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-300">
                    {suggestion.suggested_response}
                  </p>
                </div>
                <span className="absolute -bottom-4 right-2 text-4xl text-rose-200 dark:text-rose-800 font-serif leading-none select-none">"</span>
              </div>

              {/* Follow-up questions */}
              {suggestion.follow_up_questions.length > 0 && (
                <div className="mt-6 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/50">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                    Suggested follow-ups
                  </span>
                  <ul className="mt-2 space-y-1">
                    {suggestion.follow_up_questions.map((q, idx) => (
                      <li key={idx} className="text-xs text-amber-600/80 dark:text-amber-400/80 flex items-start gap-2">
                        <span className="text-amber-400 mt-0.5">•</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className={cn(
                    "transition-all duration-300",
                    "border-rose-300 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-950",
                    copied && "bg-emerald-50 border-emerald-400 text-emerald-600 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-400"
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy Response
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateSuggestion()}
                  className="border-rose-300 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-950"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
