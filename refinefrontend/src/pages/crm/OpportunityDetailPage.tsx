import { useState } from "react";
import { useParams, Link } from "react-router";
import { useOne, useDelete, useNavigation } from "@refinedev/core";
import { Trash2 } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { ReadOnlyField } from "@/components/crm/ReadOnlyField";
import { ActivitySection } from "@/components/crm/ActivitySection";

function statusVariant(status: string) {
  switch (status) {
    case "Open": return "warning" as const;
    case "Quotation": case "Converted": case "Replied": return "success" as const;
    case "Lost": case "Closed": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function OpportunityDetailPage() {
  const { name } = useParams<{ name: string }>();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const { result: opportunity } = useOne({ resource: "Opportunity", id: name! });
  const { mutateAsync: deleteRecord } = useDelete();
  const { list } = useNavigation();

  // Fetch the linked Lead for wedding details + contact info
  const isFromLead = opportunity?.opportunity_from === "Lead" && !!opportunity?.party_name;
  const { result: lead } = useOne({
    resource: "Lead",
    id: opportunity?.party_name ?? "",
    queryOptions: { enabled: isFromLead },
  });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{opportunity.party_name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(opportunity.status)}>{opportunity.status}</Badge>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
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

      {/* Two-column grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Name" value={opportunity.customer_name || opportunity.party_name || ""} />
            <ReadOnlyField label="Email" value={opportunity.contact_email || lead?.email_id || ""} />
            <ReadOnlyField label="Phone" value={opportunity.contact_mobile || lead?.phone || ""} />
            {lead?.mobile_no && <ReadOnlyField label="Mobile" value={lead.mobile_no} />}
            <ReadOnlyField label="Source" value={opportunity.source || ""} />
            {isFromLead && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Source Lead</span>
                <Link
                  to={`/crm/leads/${opportunity.party_name}`}
                  className="text-sm text-primary hover:underline"
                >
                  {opportunity.party_name}
                </Link>
              </div>
            )}
            <ReadOnlyField label="Created" value={formatDate(opportunity.creation)} />
          </CardContent>
        </Card>

        {/* Opportunity Info */}
        <Card>
          <CardHeader>
            <CardTitle>Opportunity Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="ID" value={opportunity.name} />
            <ReadOnlyField label="Type" value={opportunity.opportunity_type || ""} />
            <ReadOnlyField label="From" value={opportunity.opportunity_from || ""} />
            <ReadOnlyField label="Expected Closing" value={formatDate(opportunity.expected_closing)} />
            <ReadOnlyField label="Amount" value={opportunity.opportunity_amount ? formatVND(opportunity.opportunity_amount) : ""} />
          </CardContent>
        </Card>
      </div>

      {/* Wedding Details — from linked Lead */}
      {lead && (
        <Card>
          <CardHeader>
            <CardTitle>Wedding Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadOnlyField label="Relationship" value={lead.custom_relationship ?? ""} />
            <ReadOnlyField label="Couple Name" value={lead.custom_couple_name ?? ""} />
            <ReadOnlyField label="Wedding Date" value={lead.custom_wedding_date ? formatDate(lead.custom_wedding_date) : ""} />
            <ReadOnlyField label="Wedding Venue" value={lead.custom_wedding_venue ?? ""} />
            <ReadOnlyField label="Guest Count" value={lead.custom_guest_count ? String(lead.custom_guest_count) : ""} />
            <ReadOnlyField label="Estimated Budget" value={lead.custom_estimated_budget ? formatVND(lead.custom_estimated_budget) : ""} />
          </CardContent>
        </Card>
      )}

      {/* Activity — merged from Opportunity + source Lead */}
      <ActivitySection references={activityRefs} />
    </div>
  );
}
