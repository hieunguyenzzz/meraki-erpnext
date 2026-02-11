import { Outlet, NavLink, Link } from "react-router";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { LogOut, User, Calendar, Home } from "lucide-react";
import { motion } from "framer-motion";
import { ThemeProvider } from "@/context/theme-context";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InstallPrompt, UpdatePrompt } from "@/components/pwa";
import { OfflineBanner } from "@/components/mobile/offline-banner";

const navItems = [
  { to: "/my-profile", label: "My Profile", icon: User },
  { to: "/my-leaves", label: "My Leaves", icon: Calendar },
  { to: "/my-attendance", label: "My Attendance", icon: Home },
];

function MobileSelfServiceNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-t border-gray-100" />
      <div className="relative flex justify-around items-center h-16 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="flex flex-col items-center justify-center w-full py-2"
            style={{ minHeight: "56px" }}
          >
            {({ isActive }) => (
              <motion.div
                className="relative flex flex-col items-center"
                whileTap={{ scale: 0.9 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="self-service-nav-indicator"
                    className="absolute -inset-2 rounded-2xl bg-[#C9A9A6]/20"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon
                  className="relative h-6 w-6 transition-colors duration-200"
                  style={{ color: isActive ? "#C9A9A6" : "#9CA3AF" }}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className="relative text-[11px] mt-1 font-medium transition-colors duration-200"
                  style={{ color: isActive ? "#C9A9A6" : "#9CA3AF" }}
                >
                  {item.label.replace("My ", "")}
                </span>
              </motion.div>
            )}
          </NavLink>
        ))}
        <button
          onClick={onLogout}
          className="flex flex-col items-center justify-center w-full py-2"
          style={{ minHeight: "56px" }}
        >
          <motion.div
            className="relative flex flex-col items-center"
            whileTap={{ scale: 0.9 }}
          >
            <LogOut className="relative h-6 w-6 text-gray-400" strokeWidth={2} />
            <span className="relative text-[11px] mt-1 font-medium text-gray-400">Logout</span>
          </motion.div>
        </button>
      </div>
    </nav>
  );
}

export function SelfServiceLayout() {
  const { data: identity } = useGetIdentity<{ email: string }>();
  const { mutate: logout } = useLogout({});

  return (
    <ThemeProvider>
      {/* PWA Update Banner */}
      <UpdatePrompt />

      {/* Offline Status Banner */}
      <OfflineBanner />

      <div className="min-h-screen flex flex-col">
        {/* Desktop Header */}
        <header className="hidden md:flex border-b bg-background px-6 py-3 items-center justify-between">
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

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-white/80 backdrop-blur-xl sticky top-0 z-40">
          <Link to="/my-profile" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C9A9A6] text-white text-sm font-bold">
              M
            </div>
            <span className="text-lg font-semibold" style={{ fontFamily: "var(--font-display, Georgia, serif)" }}>
              Meraki
            </span>
          </Link>
          <span className="text-sm text-gray-500 truncate max-w-[140px]">{identity?.email}</span>
        </header>

        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
          style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
        >
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileSelfServiceNav onLogout={() => logout()} />

        {/* PWA Install Prompt */}
        <InstallPrompt />
      </div>
    </ThemeProvider>
  );
}
