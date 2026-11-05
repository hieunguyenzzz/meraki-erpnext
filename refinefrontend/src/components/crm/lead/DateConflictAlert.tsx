import { Link } from "react-router";

export interface ConflictLead { name: string; lead_name: string; status: string }
export interface ConflictOrder { name: string; customer_name: string; status: string }

/** Other leads and booked weddings on the same date. */
export function DateConflictAlert({ date, leads, orders }: { date: string; leads: ConflictLead[]; orders: ConflictOrder[] }) {
  if (leads.length === 0 && orders.length === 0) return null;
  return (
    <div role="alert" className="rounded-card bg-warning-soft px-4 py-3 text-warning-soft-foreground">
      <p className="mb-1 text-sm font-semibold">Date conflict: {date.slice(0, 10)}</p>
      <ul className="ml-4 list-disc space-y-0.5 text-sm">
        {leads.map((cl) => (
          <li key={cl.name}>
            <Link to={`/crm/leads/${cl.name}`} className="font-medium underline">{cl.lead_name}</Link> ({cl.status})
          </li>
        ))}
        {orders.map((so) => (
          <li key={so.name}>Wedding: {so.customer_name} ({so.name})</li>
        ))}
      </ul>
    </div>
  );
}
