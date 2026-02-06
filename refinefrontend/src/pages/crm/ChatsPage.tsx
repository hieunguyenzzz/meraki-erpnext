import { useState, useMemo } from "react";
import { useList } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import DOMPurify from "dompurify";
import {
  Search, ArrowUpRight, ArrowDownLeft, ExternalLink,
  MessageSquare, Mail, Phone, Users, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Medium = "Phone" | "WhatsApp" | "Email" | "Meeting" | "Other";

const MEDIUM_ICONS: Record<Medium, typeof Phone> = {
  Phone, WhatsApp: MessageSquare, Email: Mail, Meeting: Users, Other: MoreHorizontal,
};

interface Lead {
  name: string;
  lead_name: string;
  email_id?: string;
  status: string;
  creation: string;
}

interface Communication {
  name: string;
  subject?: string;
  content: string;
  communication_medium: string;
  sender: string;
  creation: string;
  sent_or_received: "Sent" | "Received";
  communication_date?: string;
  reference_doctype: string;
  reference_name: string;
}

interface LeadWithComms extends Lead {
  lastComm?: Communication;
  commCount: number;
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

// Fetch all communications for leads
function useLeadCommunications() {
  return useQuery({
    queryKey: ["all-lead-communications"],
    queryFn: async () => {
      const params = new URLSearchParams({
        doctype: "Communication",
        fields: JSON.stringify([
          "name", "subject", "content", "communication_medium",
          "sender", "creation", "sent_or_received", "communication_date",
          "reference_doctype", "reference_name",
        ]),
        filters: JSON.stringify([
          ["reference_doctype", "=", "Lead"],
          ["communication_type", "=", "Communication"],
        ]),
        order_by: "communication_date desc, creation desc",
        limit_page_length: "500",
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.message ?? []) as Communication[];
    },
  });
}

// Fetch communications for a specific lead using direct reference
function useLeadConversation(leadName: string) {
  return useQuery({
    queryKey: ["lead-conversation", leadName],
    queryFn: async () => {
      if (!leadName) return [];
      const params = new URLSearchParams({
        doctype: "Communication",
        fields: JSON.stringify([
          "name", "subject", "content", "communication_medium",
          "sender", "creation", "sent_or_received", "communication_date",
        ]),
        filters: JSON.stringify([
          ["reference_doctype", "=", "Lead"],
          ["reference_name", "=", leadName],
          ["communication_type", "=", "Communication"],
        ]),
        order_by: "communication_date asc, creation asc",
        limit_page_length: "100",
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.message ?? []) as Communication[];
    },
    enabled: !!leadName,
  });
}

function ChatList({
  leads,
  selectedLead,
  onSelectLead,
  searchQuery,
  onSearchChange,
}: {
  leads: LeadWithComms[];
  selectedLead: string | null;
  onSelectLead: (name: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads;
    const q = searchQuery.toLowerCase();
    return leads.filter(
      (l) =>
        l.lead_name.toLowerCase().includes(q) ||
        l.email_id?.toLowerCase().includes(q)
    );
  }, [leads, searchQuery]);

  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {filteredLeads.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No leads with conversations
            </p>
          ) : (
            filteredLeads.map((lead) => (
              <button
                key={lead.name}
                onClick={() => onSelectLead(lead.name)}
                className={cn(
                  "w-full p-3 text-left hover:bg-muted/50 transition-colors",
                  selectedLead === lead.name && "bg-muted"
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(lead.lead_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {lead.lead_name}
                      </span>
                      {lead.lastComm && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatRelativeTime(
                            lead.lastComm.communication_date || lead.lastComm.creation
                          )}
                        </span>
                      )}
                    </div>
                    {lead.lastComm && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {lead.lastComm.sent_or_received === "Sent" && "You: "}
                        {stripHtml(lead.lastComm.content).slice(0, 50)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {lead.status}
                      </Badge>
                      {lead.commCount > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {lead.commCount} messages
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ChatThread({
  lead,
  communications,
  isLoading,
}: {
  lead: Lead | null;
  communications: Communication[];
  isLoading: boolean;
}) {
  if (!lead) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>Select a lead to view conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(lead.lead_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold">{lead.lead_name}</h2>
            <p className="text-xs text-muted-foreground">{lead.email_id || "No email"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{lead.status}</Badge>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/crm/leads/${lead.name}`}>
              View Lead <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : communications.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {communications.map((comm) => {
              const isSent = comm.sent_or_received === "Sent";
              const MediumIcon = MEDIUM_ICONS[comm.communication_medium as Medium] ?? MoreHorizontal;

              return (
                <div
                  key={comm.name}
                  className={cn(
                    "flex",
                    isSent ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-lg p-3",
                      isSent
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {/* Metadata */}
                    <div
                      className={cn(
                        "flex items-center gap-2 text-xs mb-1",
                        isSent ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        <MediumIcon className="h-3 w-3" />
                        {comm.communication_medium}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        {isSent ? (
                          <><ArrowUpRight className="h-3 w-3" /> Sent</>
                        ) : (
                          <><ArrowDownLeft className="h-3 w-3" /> Received</>
                        )}
                      </span>
                    </div>

                    {/* Subject */}
                    {comm.subject && (
                      <p
                        className={cn(
                          "text-sm font-medium mb-1",
                          isSent ? "text-primary-foreground" : "text-foreground"
                        )}
                      >
                        {comm.subject}
                      </p>
                    )}

                    {/* Content */}
                    <div
                      className={cn(
                        "text-sm prose prose-sm max-w-none",
                        isSent
                          ? "prose-invert text-primary-foreground"
                          : "text-foreground"
                      )}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(comm.content),
                      }}
                    />

                    {/* Timestamp */}
                    <p
                      className={cn(
                        "text-[10px] mt-2",
                        isSent ? "text-primary-foreground/60" : "text-muted-foreground"
                      )}
                    >
                      {formatDateTime(comm.communication_date || comm.creation)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer note */}
      <div className="p-3 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          Replies are sent via your email client. This view is for reference only.
        </p>
      </div>
    </div>
  );
}

export default function ChatsPage() {
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  // Fetch all leads
  const { result: leadsResult } = useList({
    resource: "Lead",
    pagination: { pageSize: 500 },
    sorters: [{ field: "creation", order: "desc" }],
    filters: [
      { field: "status", operator: "nin", value: ["Do Not Contact"] },
    ],
    meta: {
      fields: ["name", "lead_name", "email_id", "status", "creation"],
    },
  });

  // Fetch all communications to get last message per lead
  const { data: allComms = [] } = useLeadCommunications();

  // Fetch conversation for selected lead
  const { data: selectedComms = [], isLoading: commsLoading } =
    useLeadConversation(selectedLead || "");

  // Merge leads with their last communication
  const leadsWithComms = useMemo<LeadWithComms[]>(() => {
    const leads = ((leadsResult as any)?.data ?? []) as Lead[];

    // Group communications by lead
    const commsByLead = new Map<string, Communication[]>();
    for (const c of allComms) {
      const existing = commsByLead.get(c.reference_name) ?? [];
      existing.push(c);
      commsByLead.set(c.reference_name, existing);
    }

    // Build leads with comms, only include leads that have communications
    const result: LeadWithComms[] = [];
    for (const lead of leads) {
      const comms = commsByLead.get(lead.name) ?? [];
      if (comms.length === 0) continue; // Only show leads with communications

      // Sort by date desc to get latest
      comms.sort((a, b) => {
        const dateA = new Date(a.communication_date || a.creation).getTime();
        const dateB = new Date(b.communication_date || b.creation).getTime();
        return dateB - dateA;
      });

      result.push({
        ...lead,
        lastComm: comms[0],
        commCount: comms.length,
      });
    }

    // Sort by last communication date
    result.sort((a, b) => {
      const dateA = a.lastComm
        ? new Date(a.lastComm.communication_date || a.lastComm.creation).getTime()
        : 0;
      const dateB = b.lastComm
        ? new Date(b.lastComm.communication_date || b.lastComm.creation).getTime()
        : 0;
      return dateB - dateA;
    });

    return result;
  }, [leadsResult, allComms]);

  // Find selected lead details
  const selectedLeadDetails = useMemo(
    () => leadsWithComms.find((l) => l.name === selectedLead) ?? null,
    [leadsWithComms, selectedLead]
  );

  // Handle lead selection (mobile view switch)
  const handleSelectLead = (name: string) => {
    setSelectedLead(name);
    setMobileView("thread");
  };

  return (
    <div className="h-[calc(100vh-4rem)]">
      {/* Desktop Layout */}
      <div className="hidden md:grid md:grid-cols-[350px_1fr] h-full">
        <ChatList
          leads={leadsWithComms}
          selectedLead={selectedLead}
          onSelectLead={setSelectedLead}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <ChatThread
          lead={selectedLeadDetails}
          communications={selectedComms}
          isLoading={commsLoading}
        />
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden h-full">
        {mobileView === "list" ? (
          <ChatList
            leads={leadsWithComms}
            selectedLead={selectedLead}
            onSelectLead={handleSelectLead}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        ) : (
          <div className="h-full flex flex-col">
            <div className="p-2 border-b">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileView("list")}
              >
                ← Back to list
              </Button>
            </div>
            <ChatThread
              lead={selectedLeadDetails}
              communications={selectedComms}
              isLoading={commsLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
