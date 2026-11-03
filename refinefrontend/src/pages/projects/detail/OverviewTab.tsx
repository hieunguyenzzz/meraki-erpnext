import type { WeddingEvent } from "@/lib/weddingEvents";
import { DetailsCard } from "./DetailsCard";
import { EventsCard } from "./EventsCard";
import { ExpensesCard } from "./ExpensesCard";
import { PaymentsCard } from "./PaymentsCard";
import { SalesCard } from "./SalesCard";
import { TeamCard } from "./TeamCard";
import type { WeddingData } from "./useWeddingData";
import type { useWeddingExpenses } from "./useWeddingExpenses";

interface Props {
  w: WeddingData;
  events: WeddingEvent[];
  expenses: ReturnType<typeof useWeddingExpenses>;
  onOpenTab: (tab: string) => void;
}

/** Desktop overview (and the phone's "Details" tab): the cards that used to live in one long column. */
export function OverviewTab({ w, events, expenses, onOpenTab }: Props) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-4">
      <DetailsCard w={w} />
      {w.isFinance && <PaymentsCard w={w} />}
      <TeamCard w={w} />
      <SalesCard w={w} />
      <EventsCard events={events} onOpenAll={() => onOpenTab("events")} />
      {w.showExpensesTab && <ExpensesCard w={w} data={expenses} onOpenAll={() => onOpenTab("expenses")} />}
    </div>
  );
}
