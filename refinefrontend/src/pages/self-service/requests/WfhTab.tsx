import { useState } from "react";
import { Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { RequestButtonBar } from "./RequestButtonBar";
import { RequestWfhSheet } from "./RequestWfhSheet";
import { useMyWfh } from "./useMyWfh";
import { WfhHistory } from "./WfhHistory";

export function WfhTab({ employeeId }: { employeeId: string }) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { requests, isLoading, isError, refetch } = useMyWfh(employeeId);

  return (
    <>
      <section aria-label="Work from home history" className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:text-[17px] md:normal-case md:tracking-normal md:text-foreground">History</h2>
          <Button className="max-md:hidden" onClick={() => setSheetOpen(true)}>
            <Plus aria-hidden />
            Request work from home
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-card md:h-14" />)}
          </div>
        ) : isError ? (
          <StatePanel kind="error" title="Could not load your requests" text="Check your connection and try again." action={{ label: "Retry", onClick: refetch, icon: <RotateCw className="h-4 w-4" /> }} />
        ) : requests.length === 0 ? (
          <StatePanel
            kind="empty"
            title="No WFH requests yet"
            text="Requests you send will show up here."
          />
        ) : (
          <WfhHistory requests={requests} desktop={desktop} />
        )}
      </section>

      <RequestButtonBar label="Request work from home" onClick={() => setSheetOpen(true)} />
      <RequestWfhSheet employeeId={employeeId} open={sheetOpen} onOpenChange={setSheetOpen} onSuccess={refetch} />
    </>
  );
}
