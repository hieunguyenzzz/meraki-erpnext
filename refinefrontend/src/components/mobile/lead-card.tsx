import { motion } from "framer-motion";
import { Phone, Mail, Calendar, ChevronRight } from "lucide-react";

interface LeadCardProps {
  lead: {
    name: string;
    lead_name: string;
    email_id?: string;
    mobile_no?: string;
    status: string;
    custom_wedding_date?: string;
    source?: string;
  };
  onClick: () => void;
}

const statusConfig: Record<
  string,
  { color: string; label: string; emoji: string }
> = {
  New: { color: "#7BA3C9", label: "New", emoji: "✨" },
  Open: { color: "#E8C47C", label: "Following up", emoji: "💬" },
  Replied: { color: "#A8B5A0", label: "Replied", emoji: "✓" },
  Interested: { color: "#8FB573", label: "Interested!", emoji: "💕" },
  Converted: { color: "#C4A962", label: "Booked", emoji: "🎉" },
  "Do Not Contact": { color: "#9CA3AF", label: "Closed", emoji: "—" },
};

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const status = statusConfig[lead.status] || statusConfig["New"];

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <motion.div
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer"
      whileTap={{ scale: 0.98 }}
      style={{ minHeight: "56px" }}
    >
      {/* Status bar - color-coded top edge */}
      <div className="h-1" style={{ backgroundColor: status.color }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            {/* Name - prominent, truncated if needed */}
            <h3
              className="font-semibold text-lg text-gray-900 truncate"
              style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
            >
              {lead.lead_name}
            </h3>

            {/* Source - subtle */}
            {lead.source && (
              <p className="text-sm text-gray-400 mt-0.5">via {lead.source}</p>
            )}
          </div>

          {/* Status badge */}
          <div
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ml-2"
            style={{
              backgroundColor: `${status.color}15`,
              color: status.color,
            }}
          >
            <span>{status.emoji}</span>
            <span>{status.label}</span>
          </div>
        </div>

        {/* Quick info row - large touch targets */}
        <div className="flex flex-wrap gap-2 mt-3">
          {lead.mobile_no && (
            <a
              href={`tel:${lead.mobile_no}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 text-green-700 active:bg-green-100 transition-colors"
              style={{ minHeight: "48px" }}
            >
              <Phone className="h-4 w-4" />
              <span className="text-sm font-medium">Call</span>
            </a>
          )}

          {lead.email_id && (
            <a
              href={`mailto:${lead.email_id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 active:bg-blue-100 transition-colors"
              style={{ minHeight: "48px" }}
            >
              <Mail className="h-4 w-4" />
              <span className="text-sm font-medium">Email</span>
            </a>
          )}

          {lead.custom_wedding_date && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">
                {formatDate(lead.custom_wedding_date)}
              </span>
            </div>
          )}
        </div>

        {/* Tap hint */}
        <div className="flex items-center justify-end mt-3 text-gray-300">
          <span className="text-xs">Tap for details</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  );
}

// Skeleton for loading state
export function LeadCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-1 bg-gray-200" />
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-1/3" />
          </div>
          <div className="h-8 bg-gray-200 rounded-full w-24" />
        </div>
        <div className="flex gap-2 mt-3">
          <div className="h-10 bg-gray-100 rounded-xl w-20" />
          <div className="h-10 bg-gray-100 rounded-xl w-20" />
        </div>
      </div>
    </div>
  );
}

export function LeadListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <LeadCardSkeleton key={i} />
      ))}
    </div>
  );
}
