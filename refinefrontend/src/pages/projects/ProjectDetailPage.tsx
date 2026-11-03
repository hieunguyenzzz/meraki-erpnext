import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useNavigation } from "@refinedev/core";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailSkeleton } from "@/components/detail-skeleton";
import { WeddingHero } from "@/components/wedding/WeddingHero";
import { daysUntilVN } from "@/lib/businessTime";
import { DeleteWeddingSheet } from "./detail/DeleteWeddingSheet";
import { stageBadgeVariant, statusVariant } from "./detail/constants";
import { WeddingActions } from "./detail/WeddingActions";
import { WeddingTabs } from "./detail/WeddingTabs";
import { useWeddingData } from "./detail/useWeddingData";
import { useWeddingEvents } from "./detail/useWeddingEvents";
import { useWeddingExpenses } from "./detail/useWeddingExpenses";

function LoadError({ name, status }: { name: string; status?: number }) {
  const { list } = useNavigation();
  const isForbidden = status === 403;
  const isMissing = status === 404;
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground -ml-2 mb-4" onClick={() => list("Project")}>
        <ArrowLeft className="h-4 w-4" />
        Back to weddings
      </Button>
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">
            {isForbidden ? "You don't have access to this wedding" : isMissing ? "Wedding not found" : "Could not load wedding"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isForbidden
              ? `You're not assigned to ${name}. If you should be on this wedding, ask the lead planner or an admin to add you.`
              : isMissing
                ? `The wedding ${name} doesn't exist or has been removed.`
                : "Something went wrong while loading this wedding. Please try again or contact an admin."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Wedding page for planners: hero with countdown, then Overview / Vendors / Events / Tasks / Expenses / Notes (phones open on "Today"). */
export default function ProjectDetailPage() {
  const { name = "" } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const w = useWeddingData(name);
  const events = useWeddingEvents(name);
  const expenses = useWeddingExpenses(name, w.showExpensesTab);

  if (w.projectQuery?.isError) return <LoadError name={name} status={(w.projectQuery.error as any)?.statusCode} />;
  const { project } = w;
  if (!project) return <DetailSkeleton />;

  const payBadge = w.isFinance && w.totalValue > 0
    ? w.paidPct >= 100 ? { label: "Paid", variant: "success" as const } : w.paidPct > 0 ? { label: "Partly paid", variant: "info" as const } : { label: "Unpaid", variant: "secondary" as const }
    : null;

  return (
    <div className="space-y-5">
      <WeddingHero
        title={w.customerName}
        date={w.weddingDate}
        facts={[w.venueName]}
        daysToGo={w.weddingDate ? daysUntilVN(w.weddingDate) : null}
        onBack={() => navigate(-1)}
        badges={
          <>
            {payBadge && <Badge variant={payBadge.variant}>{payBadge.label}</Badge>}
            <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
            <Badge variant={stageBadgeVariant(project.custom_project_stage || "Planning")}>{project.custom_project_stage || "Planning"}</Badge>
          </>
        }
        actions={<WeddingActions name={name} canAddExpense={w.showExpensesTab} onDelete={() => setDeleteOpen(true)} />}
      />
      <WeddingTabs w={w} events={events} expenses={expenses} />
      <DeleteWeddingSheet name={name} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
