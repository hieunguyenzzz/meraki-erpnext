import type { ReactNode } from "react";
import { Link } from "react-router";
import { ThemeSwitch } from "@/components/theme-switch";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** Gold rule under the wordmark. */
function Rule() {
  return <span className="block h-0.5 w-10 bg-gilt" aria-hidden="true" />;
}

/**
 * Shared frame for sign-in, reset and set-password screens (Login design).
 * Desktop: rose brand panel + form column. Phone: wordmark on top, form below,
 * content anchored to the top so the on-screen keyboard never re-centres it.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <div className="relative flex min-h-[100dvh] bg-background text-foreground">
      <div className="absolute right-3 top-3 z-10">
        <ThemeSwitch />
      </div>

      {isDesktop && (
        <section className="flex flex-1 basis-1/2 flex-col justify-between gap-12 bg-accent p-16">
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-[44px] font-semibold leading-[44px] text-foreground">Meraki</span>
            <Rule />
          </div>
          <p className="max-w-[520px] font-display text-[44px] font-medium leading-[50px] text-accent-foreground">
            Every wedding, every detail, in one place.
          </p>
          <span className="text-sm text-accent-foreground">Wedding Planner · team app</span>
        </section>
      )}

      <main className="flex flex-1 basis-1/2 flex-col items-center px-6 pb-8 max-lg:pt-20 lg:justify-center lg:py-16">
        {!isDesktop && (
          <div className="mb-10 flex flex-col items-center gap-2">
            <span className="font-display text-[56px] font-semibold leading-[56px]">Meraki</span>
            <Rule />
            <span className="mt-1 text-sm text-muted-foreground">Wedding Planner · team app</span>
          </div>
        )}
        <div className="w-full max-w-[400px]">{children}</div>
        <p className="mt-auto pt-10 text-center text-[13px] text-muted-foreground">
          Planning a wedding?{" "}
          <Link to="/inquiry" className="font-semibold text-primary underline-offset-4 hover:underline">
            Send us an inquiry
          </Link>
        </p>
      </main>
    </div>
  );
}
