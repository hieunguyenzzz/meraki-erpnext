import { motion } from "framer-motion";
import { Home, Heart, Calendar, MessageSquare, User } from "lucide-react";
import { Link, useLocation } from "react-router";

const navItems = [
  {
    icon: Home,
    label: "Home",
    href: "/",
    color: "#A8B5A0", // sage
  },
  {
    icon: Heart,
    label: "Leads",
    href: "/crm",
    color: "#C9A9A6", // rose
  },
  {
    icon: Calendar,
    label: "Weddings",
    href: "/projects",
    color: "#C4A962", // gold
  },
  {
    icon: MessageSquare,
    label: "Chats",
    href: "/crm/chats",
    color: "#7BA3C9", // soft blue
  },
  {
    icon: User,
    label: "Me",
    href: "/my-profile",
    color: "#3D3D3D", // charcoal
  },
];

export function MobileNav() {
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Frosted glass effect */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-t border-gray-100" />

      <div className="relative flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              to={item.href}
              className="flex flex-col items-center justify-center w-full py-2"
              style={{ minHeight: "56px" }}
            >
              <motion.div
                className="relative flex flex-col items-center"
                whileTap={{ scale: 0.9 }}
              >
                {/* Active indicator - subtle pill behind icon */}
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -inset-2 rounded-2xl"
                    style={{ backgroundColor: `${item.color}20` }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}

                <item.icon
                  className="relative h-6 w-6 transition-colors duration-200"
                  style={{ color: active ? item.color : "#9CA3AF" }}
                  strokeWidth={active ? 2.5 : 2}
                />

                <span
                  className="relative text-[11px] mt-1 font-medium transition-colors duration-200"
                  style={{ color: active ? item.color : "#9CA3AF" }}
                >
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
