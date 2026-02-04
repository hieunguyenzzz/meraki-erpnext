import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useOne, useList, useDelete, useNavigation, useInvalidate } from "@refinedev/core";
import { Trash2, ArrowLeft, Mail, Phone, ExternalLink, Calendar, MapPin } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { EditableField } from "@/components/crm/EditableField";
import { ConversationSection } from "@/components/crm/ConversationSection";
import { InternalNotesSection } from "@/components/crm/ActivitySection";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

function statusVariant(status: string) {
  switch (status) {
    case "Open": return "warning" as const;
    case "Quotation": case "Converted": case "Replied": return "success" as const;
    case "Lost": case "Closed": return "destructive" as const;
    default: return "secondary" as const;
  }
}

/** Parse contact form content like "Key: Value<br>" into a record */
function parseContactFormDetails(content: string): Record<string, string> {
  const details: Record<string, string> = {};
  const regex = /^([^:]+):\s*(.+?)(?:<br>|$)/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value && !key.includes('---')) {
      details[key] = value;
    }
  }
  return details;
}

/** Inline contact info item */
function ContactItem({ icon: Icon, value, href }: { icon: typeof Mail; value?: string; href?: string }) {
  if (!value) return null;
  const content = (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{value}</span>
    </span>
  );
  if (href) {
    return <a href={href} className="hover:text-foreground transition-colors">{content}</a>;
  }
  return content;
}

export default function OpportunityDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const { result: opportunity } = useOne({ resource: "Opportunity", id: name! });
  const { mutateAsync: deleteRecord } = useDelete();
  const { list } = useNavigation();
  const invalidate = useInvalidate();

  function handleFieldSaved() {
    invalidate({ resource: "Opportunity", invalidates: ["detail"], id: name! });
  }

  // Fetch the linked Lead for wedding details + contact info
  const isFromLead = opportunity?.opportunity_from === "Lead" && !!opportunity?.party_name;
  const { result: lead } = useOne({
    resource: "Lead",
    id: opportunity?.party_name ?? "",
    queryOptions: { enabled: isFromLead },
  });

  // Fetch the Contact Form Communication from the linked Lead
  const { result: contactFormResult } = useList({
    resource: "Communication",
    filters: [
      { field: "reference_doctype", operator: "eq", value: "Lead" },
      { field: "reference_name", operator: "eq", value: opportunity?.party_name },
      { field: "subject", operator: "eq", value: "Meraki Contact Form" },
    ],
    sorters: [{ field: "creation", order: "asc" }],
    pagination: { pageSize: 1 },
    meta: { fields: ["name", "subject", "content"] },
    queryOptions: { enabled: isFromLead },
  });

  // Parse wedding details from the contact form content
  const contactDetails = useMemo(() => {
    const comm = contactFormResult?.data?.[0];
    if (!comm?.content) return null;
    return parseContactFormDetails(comm.content);
  }, [contactFormResult]);

  async function handleDelete() {
    await deleteRecord({ resource: "Opportunity", id: name! });
    list("Lead");
  }

  if (!opportunity) {
    return <DetailSkeleton />;
  }

  // Build activity references — Opportunity first, then source Lead if applicable
  const activityRefs = [{ doctype: "Opportunity", docName: name! }];
  if (isFromLead) {
    activityRefs.push({ doctype: "Lead", docName: opportunity.party_name });
  }

  const contactEmail = opportunity.contact_email || lead?.email_id;
  const contactPhone = opportunity.contact_mobile || lead?.phone;
  const displayName = opportunity.customer_name || opportunity.party_name || opportunity.name;

  // Sidebar content (reused in both desktop and mobile)
  const SidebarContent = () => (
    <div className="space-y-6">
      {/* Contact Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</h3>
        <div className="space-y-2">
          <ReadOnlyField label="Name" value={displayName} />
          <ReadOnlyField label="Email" value={contactEmail || ""} />
          <ReadOnlyField label="Phone" value={contactPhone || ""} />
          {lead?.mobile_no && <ReadOnlyField label="Mobile" value={lead.mobile_no} />}
        </div>
      </div>

      {/* Source Lead */}
      {isFromLead && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</h3>
          <div className="p-2.5 rounded-md border bg-muted/20">
            <Link
              to={`/crm/leads/${opportunity.party_name}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Lead
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">{opportunity.party_name}</p>
          </div>
        </div>
      )}

      {/* Opportunity Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Opportunity</h3>
        <div className="space-y-2">
          <ReadOnlyField label="Type" value={opportunity.opportunity_type || ""} />
          <ReadOnlyField label="From" value={opportunity.opportunity_from || ""} />
          <EditableField
            label="Expected Closing"
            value={opportunity.expected_closing ?? ""}
            displayValue={formatDate(opportunity.expected_closing)}
            fieldName="expected_closing"
            doctype="Opportunity"
            docName={opportunity.name}
            type="date"
            onSaved={handleFieldSaved}
          />
          <EditableField
            label="Amount"
            value={opportunity.opportunity_amount ?? 0}
            displayValue={opportunity.opportunity_amount ? formatVND(opportunity.opportunity_amount) : undefined}
            fieldName="opportunity_amount"
            doctype="Opportunity"
            docName={opportunity.name}
            type="number"
            onSaved={handleFieldSaved}
          />
        </div>
      </div>

      {/* Wedding Details */}
      {contactDetails && Object.keys(contactDetails).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Wedding</h3>
          <div className="space-y-2">
            {contactDetails["Wedding Date"] && <ReadOnlyField label="Date" value={contactDetails["Wedding Date"]} />}
            {contactDetails["Wedding Venue"] && <ReadOnlyField label="Venue" value={contactDetails["Wedding Venue"]} />}
            {contactDetails["Guest Count"] && <ReadOnlyField label="Guests" value={contactDetails["Guest Count"]} />}
            {contactDetails.Budget && <ReadOnlyField label="Budget" value={contactDetails.Budget} />}
            {contactDetails.Couple && <ReadOnlyField label="Partner" value={contactDetails.Couple} />}
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Meta</h3>
        <div className="space-y-2">
          <ReadOnlyField label="Created" value={formatDate(opportunity.creation)} />
          <ReadOnlyField label="ID" value={opportunity.name} />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t">
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-2" /> Delete Opportunity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Opportunity</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this opportunity? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">{displayName}</h1>
          </div>
          <Badge variant={statusVariant(opportunity.status)} className="shrink-0">{opportunity.status}</Badge>
        </div>

        {/* Mobile contact info summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
          <ContactItem icon={Mail} value={contactEmail} href={`mailto:${contactEmail}`} />
          <ContactItem icon={Phone} value={contactPhone} href={`tel:${contactPhone}`} />
        </div>

        {/* Collapsible details */}
        <Collapsible open={mobileInfoOpen} onOpenChange={setMobileInfoOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between mb-4">
              {mobileInfoOpen ? "Hide details" : "Show all details"}
              <ChevronDown className={cn("h-4 w-4 transition-transform", mobileInfoOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mb-4">
              <CardContent className="pt-4">
                <SidebarContent />
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
          <Badge variant={statusVariant(opportunity.status)}>{opportunity.status}</Badge>
        </div>
      </div>

      {/* Two-column layout (desktop) */}
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <div className="sticky top-4">
            <Card>
              <CardContent className="pt-4">
                <SidebarContent />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content - Tabs */}
        <div className="min-w-0">
          <Tabs defaultValue="conversation" className="w-full">
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="conversation" className="flex-1 lg:flex-none">Conversation</TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 lg:flex-none">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="conversation" className="mt-4">
              <ConversationSection references={activityRefs} />
            </TabsContent>
            <TabsContent value="activity" className="mt-4">
              <InternalNotesSection references={activityRefs} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
