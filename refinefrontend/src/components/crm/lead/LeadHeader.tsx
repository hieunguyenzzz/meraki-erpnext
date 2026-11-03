import { ArrowLeft, Mail, Phone } from "lucide-react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { telHref } from "@/lib/phone";
import { STAGE_BADGE, stageForLeadStatus } from "@/components/crm/pipeline/stages";

/** Couple name with the pipeline stage, plus call and email buttons within thumb reach. */
export function LeadHeader({ name, status, email, phone }: { name: string; status: string; email?: string; phone?: string }) {
  const navigate = useNavigate();
  const stage = stageForLeadStatus(status);
  const tel = telHref(phone);

  return (
    <header className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0 lg:hidden" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft aria-hidden />
        </Button>
        <h1 className="min-w-0 flex-1 break-words font-display text-3xl font-semibold leading-tight md:text-4xl">{name}</h1>
        <Badge variant={STAGE_BADGE[stage.key]} className="shrink-0" title={`ERPNext status: ${status}`}>{stage.label}</Badge>
      </div>
      {(tel || email) && (
        <div className="flex gap-2">
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
