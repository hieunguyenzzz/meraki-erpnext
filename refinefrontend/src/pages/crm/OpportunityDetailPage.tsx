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

export default function OpportunityDetailPage() {
  const { name } = useParams<{ name: string }>();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const { result: opportunity } = useOne({ resource: "Opportunity", id: name! });
  const { mutateAsync: deleteRecord } = useDelete();
  const { list } = useNavigation();

  async function handleDelete() {
    await deleteRecord({ resource: "Opportunity", id: name! });
    list("Lead");
  }

  if (!opportunity) {
    return <DetailSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{opportunity.party_name}</h1>
        <Badge>{opportunity.status}</Badge>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm" className="ml-auto">
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Opportunity Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span>{opportunity.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{opportunity.opportunity_type || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">From</span>
              <span>{opportunity.opportunity_from || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source</span>
              <span>{opportunity.source || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected Closing</span>
              <span>{formatDate(opportunity.expected_closing)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span>{opportunity.opportunity_amount ? formatVND(opportunity.opportunity_amount) : "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(opportunity.creation)}</span>
            </div>
          </CardContent>
        </Card>

        {opportunity.opportunity_from === "Lead" && opportunity.party_name && (
          <Card>
            <CardHeader>
              <CardTitle>Source Lead</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                to={`/crm/leads/${opportunity.party_name}`}
                className="font-medium text-primary hover:underline"
              >
                {opportunity.party_name}
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
