import { Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, LogOut, PanelLeft } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { MODULES, hasModuleAccess } from "@/lib/roles";
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
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function SidebarToggle() {
  const { collapsed, setCollapsed } = useSidebar();
  return (
    <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)}>
      <PanelLeft className="h-4 w-4" />
    </Button>
  );
}

function AppSidebar() {
  const location = useLocation();
  const { user, roles, logout } = useUser();
  const { collapsed } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        {!collapsed && <span className="text-lg font-bold">Meraki</span>}
        <SidebarToggle />
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton isActive={location.pathname === "/"}>
                  <LayoutDashboard className="h-4 w-4" />
                  {!collapsed && <span>Dashboard</span>}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {MODULES.filter((mod) => hasModuleAccess(roles, mod.roles)).map((mod) => (
          <SidebarGroup key={mod.path}>
            <SidebarGroupLabel>{mod.label}</SidebarGroupLabel>
            <SidebarMenu>
              {mod.children.map((child) => (
                <SidebarMenuItem key={child.path}>
                  <Link to={child.path}>
                    <SidebarMenuButton isActive={location.pathname.startsWith(child.path)}>
                      {!collapsed && <span>{child.label}</span>}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && <div className="text-xs text-muted-foreground mb-2 truncate">{user}</div>}
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export function Layout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
