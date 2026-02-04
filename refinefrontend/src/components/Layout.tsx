import { Link, Outlet, useLocation } from "react-router";
import { LayoutDashboard } from "lucide-react";
import { usePermissions } from "@refinedev/core";
import { MODULES, hasModuleAccess } from "@/lib/roles";
import { ThemeProvider } from "@/context/theme-context";
import { SearchProvider } from "@/context/search-context";
import { CommandMenu } from "@/components/command-menu";
import { Header } from "@/components/layout/header";
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
            <div className="flex h-screen">
              <AppSidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main id="main-content" className="flex-1 overflow-y-auto p-6">
                  <Outlet />
                </main>
              </div>
            </div>
            <CommandMenu />
          </SidebarProvider>
        </TooltipProvider>
      </SearchProvider>
    </ThemeProvider>
  );
}
