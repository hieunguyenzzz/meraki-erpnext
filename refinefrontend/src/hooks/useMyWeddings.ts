import { useQuery } from "@tanstack/react-query";

export interface MyWedding {
  id: string;
  project_name: string;
  /** project_name without a trailing " Wedding", for tight spaces. */
  couple_label: string;
  wedding_date: string | null;
  days_to_go: number | null;
  /** Completed, or its date has passed (decided by the backend). */
  finished: boolean;
  venue_name: string | null;
  stage: string;
  status: string;
  my_role: "lead" | "support" | "assistant";
}

export interface MyWeddingDetail extends Omit<MyWedding, "venue_name"> {
  customer_name: string | null;
  venue_name: string | null;
  guest_count: number | null;
  package: string | null;
  wedding_type: string | null;
  team: { employee: string; name: string; role: string; phone: string | null }[];
  events: {
    name: string;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    venue_name: string | null;
    guest_count: number | null;
    notes: string | null;
    staff: { name: string; role: string | null; call_time: string | null }[];
  }[];
  my_expenses: { name: string; date: string; amount: number; description: string; status: string; rejected_reason: string | null }[];
}

/** Within this many days of the wedding the countdown is highlighted. */
export const SOON_DAYS = 14;

const NONE: MyWedding[] = [];

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`${url} returned ${status}`);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json();
}

/** Weddings the signed-in staff member is assigned to (scoped server-side). */
export function useMyWeddings(enabled = true) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-weddings"],
    queryFn: () => getJson<{ data: MyWedding[] }>("/inquiry-api/my/weddings"),
    enabled,
  });
  return { weddings: data?.data ?? NONE, isLoading, isError };
}

export function useMyWedding(id: string | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-wedding", id],
    queryFn: () => getJson<{ data: MyWeddingDetail }>(`/inquiry-api/my/weddings/${encodeURIComponent(id!)}`),
    enabled: !!id,
    retry: false,
  });
  return { wedding: data?.data ?? null, isLoading, error: error as Error | null };
}

export function countdownLabel(days: number | null): string {
  if (days == null) return "";
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  return `${days}d`;
}

export const ROLE_LABEL: Record<string, string> = { lead: "Lead planner", support: "Support planner", assistant: "Assistant" };
