import { useMemo, useState } from "react";
import { useList, useCreate, useInvalidate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { buildKanbanItems, enrichWithActivity, enrichWithMeetings } from "@/lib/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Simplified Lead-only CRM: All stages use Lead doctype (no Opportunity conversion)
// Drag and drop disabled - leads are moved via webhook API only

export default function KanbanPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    lead_name: "",
    email_id: "",
    phone: "",
    source: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { mutateAsync: createLead } = useCreate();

  const { result: leadsResult, query: leadsQuery } = useList({
    resource: "Lead",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "lead_name", "status", "email_id", "phone", "creation"],
    },
  });

  const { result: oppsResult, query: oppsQuery } = useList({
    resource: "Opportunity",
    pagination: { mode: "off" },
    meta: {
      fields: ["name", "party_name", "customer_name", "status", "contact_email", "contact_mobile", "creation"],
    },
  });

  const ninetyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }, []);

  const { result: commsResult, query: commsQuery } = useList({
    resource: "Communication",
    pagination: { mode: "off" },
    sorters: [{ field: "communication_date", order: "desc" }],
    filters: [
      { field: "reference_doctype", operator: "in", value: ["Lead", "Opportunity"] },
      { field: "communication_type", operator: "eq", value: "Communication" },
      { field: "communication_date", operator: "gte", value: ninetyDaysAgo },
    ],
    meta: {
      fields: ["name", "reference_doctype", "reference_name", "sent_or_received", "communication_date", "creation"],
    },
  });

  // Fetch Events with Lead participants using direct API call
  // frappe.client.get_list supports child table filters and fields
  const { data: eventsWithParticipants } = useQuery({
    queryKey: ["events-with-lead-participants"],
    queryFn: async () => {
      const params = new URLSearchParams({
        doctype: "Event",
        fields: JSON.stringify([
          "name", "subject", "starts_on", "ends_on",
          "`tabEvent Participants`.reference_doctype",
          "`tabEvent Participants`.reference_docname"
        ]),
        filters: JSON.stringify([["Event Participants", "reference_doctype", "=", "Lead"]]),
        limit_page_length: "0",
      });
      const res = await fetch(`/api/method/frappe.client.get_list?${params}`, {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.message ?? [];
    },
  });

  // Build meeting data: map Lead name to earliest meeting date
  const meetingEvents = useMemo(() => {
    const events = eventsWithParticipants ?? [];
    const result: { reference_docname: string; starts_on: string }[] = [];

    for (const e of events) {
      if (e.reference_docname && e.starts_on) {
        result.push({
          reference_docname: e.reference_docname,
          starts_on: e.starts_on,
        });
      }
    }
    return result;
  }, [eventsWithParticipants]);

  const items = useMemo(() => {
    const base = buildKanbanItems(leadsResult?.data ?? [], oppsResult?.data ?? []);
    const withActivity = enrichWithActivity(base, commsResult?.data ?? []);
    return enrichWithMeetings(withActivity, meetingEvents);
  }, [leadsResult, oppsResult, commsResult, meetingEvents]);

  // Lead Sources for dropdown
  const { result: sourcesResult } = useList({
    resource: "Lead Source",
    pagination: { mode: "off" as const },
    meta: { fields: ["name"] },
  });
  const leadSources = (sourcesResult?.data ?? []).map((s: any) => s.name);

  const isLoading = leadsQuery?.isLoading || oppsQuery?.isLoading || commsQuery?.isLoading;

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.lead_name.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await createLead({
        resource: "Lead",
        values: {
          lead_name: formData.lead_name.trim(),
          email_id: formData.email_id.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          source: formData.source || undefined,
          status: "Lead",
        },
      });
      setCreateOpen(false);
      setFormData({ lead_name: "", email_id: "", phone: "", source: "" });
      invalidate({ resource: "Lead", invalidates: ["list"] });
      // Navigate to the new lead
      if (result?.data?.name) {
        navigate(`/crm/leads/${result.data.name}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM Pipeline</h1>
          <p className="text-sm text-muted-foreground">View leads by stage</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Lead</DialogTitle>
              <DialogDescription>
                Add a new lead to your CRM pipeline.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateLead} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lead_name">Lead Name *</Label>
                <Input
                  id="lead_name"
                  placeholder="e.g. John & Jane Smith"
                  value={formData.lead_name}
                  onChange={(e) => setFormData({ ...formData, lead_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email_id">Email</Label>
                <Input
                  id="email_id"
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email_id}
                  onChange={(e) => setFormData({ ...formData, email_id: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+84 123 456 789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSources.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !formData.lead_name.trim()}>
                  {isSubmitting ? "Creating..." : "Create Lead"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <>
          {/* Desktop skeleton */}
          <div className="hidden md:grid grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-muted p-3 space-y-3 min-h-[300px]">
                <Skeleton className="h-4 w-[60px]" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
          {/* Mobile skeleton */}
          <div className="md:hidden space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-lg" />
              ))}
            </div>
            <div className="rounded-lg border border-muted p-3 space-y-3 min-h-[200px]">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </>
      ) : (
        <>
          <KanbanBoard items={items} />
          <div className="hidden md:block mt-6 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground uppercase tracking-wide">Stage Guide</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
              <div><span className="font-medium text-foreground">New</span> — Fresh inquiry</div>
              <div><span className="font-medium text-foreground">Engaged</span> — In conversation</div>
              <div><span className="font-medium text-foreground">Meeting</span> — Meeting scheduled</div>
              <div><span className="font-medium text-foreground">Quoted</span> — Quote sent</div>
              <div><span className="font-medium text-foreground">Won</span> — Deal closed</div>
              <div><span className="font-medium text-foreground">Lost</span> — Did not proceed</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
