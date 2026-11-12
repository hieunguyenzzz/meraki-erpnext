import { useCallback, useEffect, useState } from "react";

export interface Criterion {
  name: string;
  criterion_name: string;
  sort_order: number;
}

/** Active review criteria from the backend; failures are logged and surfaced, never swallowed. */
export function useReviewCriteria() {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(false);
    fetch("/inquiry-api/reviews/criteria", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((d) => live && setCriteria(d.criteria ?? []))
      .catch((err) => {
        console.error("Failed to load review criteria", err);
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { criteria, error, retry };
}
