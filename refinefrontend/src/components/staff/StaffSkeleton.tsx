import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder: rows on desktop, cards on phones. */
export function StaffSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 md:gap-0 md:overflow-hidden md:rounded-2xl md:border md:bg-card" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-3 md:rounded-none md:border-0 md:border-b md:px-4 md:py-3 md:last:border-b-0">
          <Skeleton className="h-[34px] w-[34px] rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
