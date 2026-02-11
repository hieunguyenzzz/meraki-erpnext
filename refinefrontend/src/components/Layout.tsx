import { Link, Outlet, useLocation } from "react-router";
import { LayoutDashboard } from "lucide-react";
import { usePermissions } from "@refinedev/core";
import { MODULES, hasModuleAccess } from "@/lib/roles";
import { ThemeProvider } from "@/context/theme-context";
import { SearchProvider } from "@/context/search-context";
import { CommandMenu } from "@/components/command-menu";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { InstallPrompt, UpdatePrompt } from "@/components/pwa";
import { OfflineBanner } from "@/components/mobile/offline-banner";
import { QuickActionFab } from "@/components/mobile/quick-actions";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function AppSidebar() {
  const location = useLocation();
  const { data: roles } = usePermissions<string[]>({});
  const userRoles = roles ?? [];

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            M
          </div>
          <span className="text-lg font-bold sidebar-expanded-only">Meraki</span>
        </Link>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarNavItem
                to="/"
                icon={<LayoutDashboard className="h-4 w-4" />}
                label="Dashboard"
                isActive={location.pathname === "/"}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {MODULES.filter((mod) => hasModuleAccess(userRoles, mod.roles)).map((mod) => (
          <SidebarGroup key={mod.path}>
            <SidebarGroupLabel>{mod.label}</SidebarGroupLabel>
            <SidebarMenu>
              {mod.children.map((child) => {
                const isActive = child.path === "/crm"
                  ? location.pathname === "/crm"
                  : location.pathname.startsWith(child.path);
                return (
                  <SidebarMenuItem key={child.path}>
                    <SidebarNavItem
                      to={child.path}
                      icon={child.icon && <child.icon className="h-4 w-4" />}
                      label={child.label}
                      isActive={isActive}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

function SidebarNavItem({
  to,
  icon,
  label,
  isActive,
}: {
  to: string;
  icon?: React.ReactNode;
  label: string;
  isActive: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={to}>
          <SidebarMenuButton isActive={isActive}>
            {icon}
            <span className="sidebar-expanded-only">{label}</span>
          </SidebarMenuButton>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="sidebar-collapsed-only">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Layout() {
  return (
    <ThemeProvider>
      <SearchProvider>
        <TooltipProvider delayDuration={0}>
          <SidebarProvider>
            {/* PWA Update Banner */}
            <UpdatePrompt />

            {/* Offline Status Banner */}
            <OfflineBanner />

            <div className="flex h-screen">
              {/* Desktop Sidebar - hidden on mobile */}
              <div className="hidden md:block">
                <AppSidebar />
              </div>

              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Desktop Header - hidden on mobile */}
                <div className="hidden md:block">
                  <Header />
                </div>

                {/* Mobile Header */}
                <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-white/80 backdrop-blur-xl sticky top-0 z-40">
                  <Link to="/" className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C9A9A6] text-white text-sm font-bold">
                      M
                    </div>
                    <span className="text-lg font-semibold" style={{ fontFamily: "var(--font-display, Georgia, serif)" }}>
                      Meraki
                    </span>
                  </Link>
                </header>

                <main
                  id="main-content"
                  className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6"
                  style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
                >
                  <Outlet />
                </main>
              </div>
            </div>

            {/* Desktop Command Menu */}
            <CommandMenu />

            {/* Mobile Navigation */}
            <MobileNav />

            {/* Mobile Quick Action FAB */}
            <QuickActionFab />

            {/* PWA Install Prompt */}
            <InstallPrompt />
          </SidebarProvider>
        </TooltipProvider>
      </SearchProvider>
    </ThemeProvider>
  );
}
