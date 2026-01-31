import { useState } from "react";
import { Link } from "react-router";
import { useList } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LEAD_STATUSES = ["All", "Lead", "Open", "Replied", "Opportunity", "Quotation", "Lost Quotation", "Interested", "Converted", "Do Not Contact"];

function statusVariant(status: string) {
  switch (status) {
    case "Lead": return "info" as const;
    case "Open": return "warning" as const;
    case "Replied": case "Interested": case "Converted": case "Opportunity": case "Quotation": return "success" as const;
    case "Lost Quotation": case "Do Not Contact": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function LeadsPage() {
  const [status, setStatus] = useState("All");

  const { result, query } = useList({
    resource: "Lead",
    pagination: { mode: "off" },
    sorters: [{ field: "creation", order: "desc" }],
    filters: status !== "All" ? [{ field: "status", operator: "eq", value: status }] : [],
    meta: { fields: ["name", "lead_name", "email_id", "phone", "source", "status", "creation"] },
  });

  const leads = result?.data ?? [];
  const isLoading = query.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Leads</h1>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Leads ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : leads.length === 0 ? (
            <p className="text-muted-foreground">No leads found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead: any) => (
                  <TableRow key={lead.name}>
                    <TableCell>
                      <Link to={`/crm/leads/${lead.name}`} className="font-medium text-primary hover:underline">
                        {lead.lead_name}
                      </Link>
                    </TableCell>
                    <TableCell>{lead.email_id || "-"}</TableCell>
                    <TableCell>{lead.phone || "-"}</TableCell>
                    <TableCell>{lead.source || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
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
