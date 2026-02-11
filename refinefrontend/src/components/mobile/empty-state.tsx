import { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {/* Decorative icon with soft background */}
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
        <div className="text-gray-400">{icon}</div>
      </div>

      <h3
        className="text-xl font-semibold text-gray-900 mb-2"
        style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
      >
        {title}
      </h3>

      <p className="text-gray-500 mb-6 max-w-xs">{description}</p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 rounded-full font-medium text-white transition-colors hover:opacity-90 active:opacity-80"
          style={{
            backgroundColor: "#C9A9A6",
            minHeight: "56px",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
