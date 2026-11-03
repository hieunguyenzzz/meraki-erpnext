import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function Wordmark({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("flex flex-col gap-[3px]", className)} aria-label="Meraki home">
      <span className="font-display text-[28px] font-semibold leading-[30px]">Meraki</span>
      <span className="h-[1.5px] w-6 bg-gilt" />
    </Link>
  );
}
