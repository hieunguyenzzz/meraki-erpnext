import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles = {
  danger: {
    bg: "#D4837A",
    icon: AlertCircle,
  },
  warning: {
    bg: "#E8C47C",
    icon: AlertTriangle,
  },
  info: {
    bg: "#7BA3C9",
    icon: Info,
  },
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "warning",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onCancel}
          />

          {/* Dialog - positioned at bottom for thumb reach */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl z-50 overflow-hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="p-6">
              {/* Icon */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4 mx-auto"
                style={{ backgroundColor: `${style.bg}20` }}
              >
                <Icon className="h-7 w-7" style={{ color: style.bg }} />
              </div>

              {/* Content */}
              <h3
                className="text-xl font-semibold text-center text-gray-900 mb-2"
                style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
              >
                {title}
              </h3>
              <p className="text-gray-500 text-center mb-6">{message}</p>

              {/* Actions - stacked for easy thumb reach */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={onConfirm}
                  className="w-full py-4 rounded-xl font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
                  style={{
                    backgroundColor: style.bg,
                    minHeight: "56px",
                  }}
                >
                  {confirmLabel}
                </button>

                <button
                  onClick={onCancel}
                  className="w-full py-4 rounded-xl font-semibold text-gray-600 bg-gray-100 transition-colors hover:bg-gray-200 active:bg-gray-300"
                  style={{ minHeight: "56px" }}
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
