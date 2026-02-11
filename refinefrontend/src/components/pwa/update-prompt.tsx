import { useRegisterSW } from "virtual:pwa-register/react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered:", r);
    },
    onRegisterError(error) {
      console.log("SW registration error:", error);
    },
  });

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
  };

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="bg-[#7BA3C9] text-white rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3
                    className="font-semibold"
                    style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
                  >
                    Update Available
                  </h3>
                  <p className="text-sm text-white/80 mt-0.5">
                    A new version of Meraki is ready
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-5 h-5 text-white/80" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleUpdate}
                  className="flex-1 py-3 rounded-xl font-medium text-[#7BA3C9] bg-white hover:bg-gray-50 transition-colors"
                  style={{ minHeight: "48px" }}
                >
                  Update Now
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-3 rounded-xl font-medium text-white/90 bg-white/20 hover:bg-white/30 transition-colors"
                  style={{ minHeight: "48px" }}
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
