import { Link } from "react-router";
import { cn } from "@/lib/utils";

/** `large` is the desktop sidebar size (Sidebar.dc.html); default is the mobile top bar size (M-Home.dc.html). */
export function Wordmark({ to = "/", className, large = false }: { to?: string; className?: string; large?: boolean }) {
  return (
    <Link to={to} className={cn("flex flex-col gap-[3px]", className)} aria-label="Meraki home">
      <span className={cn("font-display font-semibold", large ? "text-[30px] leading-8" : "text-[28px] leading-[30px]")}>
        Meraki
      </span>
      <span className={cn("h-[1.5px] bg-gilt", large ? "w-[26px]" : "w-6")} />
    </Link>
  );
}
