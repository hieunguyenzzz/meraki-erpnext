import { Outlet } from "react-router";
import { ThemeProvider } from "@/context/theme-context";
import { SearchProvider } from "@/context/search-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandMenu } from "@/components/command-menu";
import { InstallPrompt, UpdatePrompt } from "@/components/pwa";
import { OfflineBanner } from "@/components/mobile/offline-banner";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { BottomBar } from "@/components/layout/BottomBar";

/** The single app shell: sidebar + top bar on desktop, top bar + bottom bar on mobile. */
export function AppShell() {
  return (
    <ThemeProvider>
      <SearchProvider>
        <TooltipProvider delayDuration={0}>
          <UpdatePrompt />
          <OfflineBanner />

          <div className="flex h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TopBar />
              <main
                id="main-content"
                className="flex-1 overflow-y-auto p-4 pb-[calc(104px+env(safe-area-inset-bottom,0px))] md:p-6"
              >
                <Outlet />
              </main>
            </div>
          </div>

          <CommandMenu />
          <BottomBar />
          <InstallPrompt />
        </TooltipProvider>
      </SearchProvider>
    </ThemeProvider>
  );
}
