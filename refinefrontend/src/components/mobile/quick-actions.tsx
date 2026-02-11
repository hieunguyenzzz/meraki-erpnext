import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Phone, UserPlus, Calendar, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router";

const actions = [
  {
    icon: UserPlus,
    label: "New Lead",
    color: "#C9A9A6",
    href: "/crm",
  },
  {
    icon: Phone,
    label: "Log Call",
    color: "#A8B5A0",
    href: "/crm/chats",
  },
  {
    icon: Calendar,
    label: "Schedule",
    color: "#C4A962",
    href: "/projects",
  },
  {
    icon: MessageCircle,
    label: "Quick Note",
    color: "#7BA3C9",
    href: "/crm/chats",
  },
];

export function QuickActionFab() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleAction = (href: string) => {
    setIsOpen(false);
    navigate(href);
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* FAB and menu */}
      <div
        className="fixed right-4 z-50 md:hidden"
        style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Action buttons */}
        <AnimatePresence>
          {isOpen && (
            <motion.div className="absolute bottom-16 right-0 flex flex-col gap-3">
              {actions.map((action, index) => (
                <motion.button
                  key={action.label}
                  onClick={() => handleAction(action.href)}
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.5, y: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3"
                >
                  {/* Label */}
                  <span className="px-3 py-2 bg-white rounded-lg shadow-md text-sm font-medium text-gray-700 whitespace-nowrap">
                    {action.label}
                  </span>

                  {/* Icon button */}
                  <div
                    className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
                    style={{ backgroundColor: action.color }}
                  >
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main FAB */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center"
          style={{
            backgroundColor: isOpen ? "#3D3D3D" : "#C9A9A6",
            minHeight: "56px",
            minWidth: "56px",
          }}
          whileTap={{ scale: 0.9 }}
          animate={{ rotate: isOpen ? 45 : 0 }}
        >
          {isOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Plus className="h-6 w-6 text-white" />
          )}
        </motion.button>
      </div>
    </>
  );
}
