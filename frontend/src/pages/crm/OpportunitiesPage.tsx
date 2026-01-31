import { useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatVND, formatDate } from "@/lib/format";

const OPP_STATUSES = ["All", "Open", "Quotation", "Converted", "Lost", "Replied", "Closed"];

function statusVariant(status: string) {
  switch (status) {
    case "Converted": return "success" as const;
    case "Lost": case "Closed": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function OpportunitiesPage() {
  const [status, setStatus] = useState("All");

  const { data, isLoading } = useFrappeGetDocList("Opportunity", {
    fields: ["name", "party_name", "opportunity_type", "status", "expected_closing", "opportunity_amount", "creation"],
    filters: status !== "All" ? [["status", "=", status]] : undefined,
    orderBy: { field: "creation", order: "desc" },
    limit_start: 0,
    limit: 0,
  });

  const opportunities = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Opportunities</h1>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {OPP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Opportunities ({opportunities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : opportunities.length === 0 ? (
            <p className="text-muted-foreground">No opportunities found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expected Closing</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((opp) => (
                  <TableRow key={opp.name}>
                    <TableCell>
                      <Link to={`/crm/opportunities/${opp.name}`} className="font-medium text-primary hover:underline">
                        {opp.party_name}
                      </Link>
                    </TableCell>
                    <TableCell>{opp.opportunity_type || "-"}</TableCell>
                    <TableCell>{formatDate(opp.expected_closing)}</TableCell>
                    <TableCell className="text-right">{opp.opportunity_amount ? formatVND(opp.opportunity_amount) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(opp.status)}>{opp.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
