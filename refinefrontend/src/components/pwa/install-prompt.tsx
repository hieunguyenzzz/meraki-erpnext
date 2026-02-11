import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstall(false);
        setDeferredPrompt(null);
      }
    }
  };

  const handleDismiss = () => {
    setShowInstall(false);
    // Don't clear deferredPrompt so user can still install later
  };

  return (
    <AnimatePresence>
      {showInstall && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Rose accent bar */}
            <div className="h-1 bg-[#C9A9A6]" />

            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-[#C9A9A6]/10 flex items-center justify-center flex-shrink-0">
                  <Download className="w-6 h-6 text-[#C9A9A6]" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3
                    className="font-semibold text-gray-900"
                    style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
                  >
                    Install Meraki App
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Add to home screen for quick access
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleInstall}
                  className="flex-1 py-3 rounded-xl font-medium text-white bg-[#C9A9A6] hover:bg-[#b99994] transition-colors"
                  style={{ minHeight: "48px" }}
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
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
