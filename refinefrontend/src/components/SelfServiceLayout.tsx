import { Outlet, NavLink } from "react-router";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { LogOut, User, Calendar, Home } from "lucide-react";
import { ThemeProvider } from "@/context/theme-context";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/my-profile", label: "My Profile", icon: User },
  { to: "/my-leaves", label: "My Leaves", icon: Calendar },
  { to: "/my-attendance", label: "My Attendance", icon: Home },
];

export function SelfServiceLayout() {
  const { data: identity } = useGetIdentity<{ email: string }>();
  const { mutate: logout } = useLogout({});

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <header className="border-b bg-background px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="text-lg font-bold">Meraki</span>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <ThemeSwitch />
            <span className="text-sm text-muted-foreground">{identity?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </ThemeProvider>
  );
}
