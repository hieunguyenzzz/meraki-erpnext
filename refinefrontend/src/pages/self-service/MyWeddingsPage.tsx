import { Skeleton } from "@/components/ui/skeleton";
import { useMyWeddings } from "@/hooks/useMyWeddings";
import { WeddingRow } from "@/components/dashboard/WeddingRow";

/** Weddings the signed-in staff member is assigned to (open, plus finished in the last 30 days). */
export default function MyWeddingsPage() {
  const { weddings, isLoading, isError } = useMyWeddings();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">My weddings</h1>
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : isError ? (
        <p className="text-sm text-danger-soft-foreground">Could not load your weddings. Please try again.</p>
      ) : weddings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weddings are assigned to you yet.</p>
      ) : (
        <div className="space-y-2">{weddings.map((w) => <WeddingRow key={w.id} wedding={w} />)}</div>
      )}
    </div>
  );
}
