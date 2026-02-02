import { Outlet } from "react-router";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { LogOut } from "lucide-react";
import { ThemeProvider } from "@/context/theme-context";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";

export function SelfServiceLayout() {
  const { data: identity } = useGetIdentity<{ email: string }>();
  const { mutate: logout } = useLogout({});

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <header className="border-b bg-background px-6 py-3 flex items-center justify-between">
          <span className="text-lg font-bold">Meraki</span>
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
