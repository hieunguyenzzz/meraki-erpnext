import { Link, useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/StatePanel";
import { useMyWeddings } from "@/hooks/useMyWeddings";
import { WeddingRow } from "@/components/dashboard/WeddingRow";
import { MyWeddingsTable } from "./my-weddings/MyWeddingsTable";

const SECTION_HEADING = "px-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

function Section({ title, weddings }: { title: string; weddings: ReturnType<typeof useMyWeddings>["weddings"] }) {
  if (weddings.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5 md:gap-3">
      <h2 className={SECTION_HEADING}>{title}</h2>
      <div className="flex flex-col gap-2.5 md:hidden">{weddings.map((w) => <WeddingRow key={w.id} wedding={w} />)}</div>
      <div className="hidden md:block"><MyWeddingsTable weddings={weddings} /></div>
    </section>
  );
}

/** Weddings the signed-in staff member is assigned to (open, plus finished in the last 30 days). */
export default function MyWeddingsPage() {
  const navigate = useNavigate();
  const { weddings, isLoading, isError } = useMyWeddings();
  const upcoming = weddings.filter((w) => !w.finished);
  const finished = weddings.filter((w) => w.finished);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">My Weddings</h1>
          {weddings.length > 0 && <p className="text-sm text-muted-foreground">Weddings you're on the team for. Read-only.</p>}
        </div>
        {weddings.length > 0 && (
          <Link to="/finance/expenses/new" className="hidden h-10 items-center gap-1.5 rounded-full bg-primary-fill px-4 text-sm font-semibold text-primary-fill-foreground md:flex">
            <Plus className="h-4 w-4" aria-hidden />Add expense
          </Link>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-2.5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px] w-full rounded-card" />)}</div>
      ) : isError ? (
        <StatePanel kind="error" title="Could not load your weddings" text="Please try again in a moment." action={{ label: "Reload", onClick: () => window.location.reload() }} />
      ) : weddings.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No weddings assigned to you yet"
          text="When a planner adds you to a wedding team, it shows up here with its date, venue and events."
          action={{ label: "Go to Requests", onClick: () => navigate("/my-leaves") }}
        />
      ) : (
        <>
          <Section title={`Upcoming · ${upcoming.length}`} weddings={upcoming} />
          <Section title="Finished · last 30 days" weddings={finished} />
        </>
      )}
    </div>
  );
}
