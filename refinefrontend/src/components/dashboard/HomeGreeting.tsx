import { formatWeekdayIso } from "@/lib/format";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeGreeting({ firstName }: { firstName: string }) {
  const now = new Date();
  return (
    <div className="px-1">
      <div className="text-sm text-muted-foreground">{formatWeekdayIso(now)}</div>
      <h1 className="mt-0.5 text-2xl font-semibold leading-[30px]">
        {greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}
      </h1>
    </div>
  );
}
