import { ArrowLeft, Mail, Phone, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { telHref } from "@/lib/phone";
import type { ColumnKey } from "@/lib/kanban";
import { STAGE_BADGE, stageForLeadStatus } from "@/components/crm/pipeline/stages";
import { StageMenu } from "./StageMenu";

/** Breadcrumb, couple name, stage badge, Change stage and Delete lead; call and email buttons on phones. */
export function LeadHeader({ name, status, email, phone, stageBusy, onStage, onDelete }: {
  name: string; status: string; email?: string; phone?: string;
  stageBusy: boolean; onStage: (key: ColumnKey) => void; onDelete: () => void;
}) {
  const navigate = useNavigate();
  const stage = stageForLeadStatus(status);
  const tel = telHref(phone);

  return (
    <header className="space-y-3">
      <nav aria-label="Breadcrumb" className="hidden text-sm text-muted-foreground lg:block">
        <Link to="/crm" className="text-primary hover:underline">Leads</Link> / {name}
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0 lg:hidden" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft aria-hidden />
        </Button>
        <h1 className="min-w-0 break-words font-display text-3xl font-semibold leading-tight lg:text-[38px] lg:leading-[42px]">{name}</h1>
        <Badge variant={STAGE_BADGE[stage.key]} className="h-7 shrink-0 px-3 text-[13px] font-bold" title={`ERPNext status: ${status}`}>{stage.label}</Badge>
        <span className="hidden flex-1 lg:block" />
        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
          <StageMenu current={stage.key} disabled={stageBusy} onPick={onStage} />
          <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
            <Trash2 aria-hidden /> Delete lead
          </Button>
        </div>
      </div>
      {(tel || email) && (
        <div className="flex gap-2 lg:hidden">
          {tel && (
            <Button asChild variant="outline" className="flex-1 sm:flex-none"><a href={tel}><Phone aria-hidden />Call</a></Button>
          )}
          {email && (
            <Button asChild variant="outline" className="flex-1 sm:flex-none"><a href={`mailto:${email}`}><Mail aria-hidden />Email</a></Button>
          )}
        </div>
      )}
    </header>
  );
}
