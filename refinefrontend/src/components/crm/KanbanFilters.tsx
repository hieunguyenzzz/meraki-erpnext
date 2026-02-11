import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  User,
  MapPin,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Filter,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WaitingFilter = "all" | "client" | "staff";
export type SortOrder = "newest" | "oldest";

interface KanbanFiltersProps {
  /** Current waiting filter */
  waitingFilter: WaitingFilter;
  onWaitingFilterChange: (filter: WaitingFilter) => void;
  /** Current location filter */
  locationFilter: string | null;
  onLocationFilterChange: (location: string | null) => void;
  /** Available locations */
  locations: string[];
  /** Sort order */
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  /** Active filter count for mobile badge */
  activeFilterCount?: number;
}

export function KanbanFilters({
  waitingFilter,
  onWaitingFilterChange,
  locationFilter,
  onLocationFilterChange,
  locations,
  sortOrder,
  onSortOrderChange,
}: KanbanFiltersProps) {
  const [locationOpen, setLocationOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeCount =
    (waitingFilter !== "all" ? 1 : 0) + (locationFilter ? 1 : 0);

  const clearAllFilters = () => {
    onWaitingFilterChange("all");
    onLocationFilterChange(null);
  };

  return (
    <>
      {/* Desktop Filters */}
      <div className="hidden md:flex items-center gap-3 flex-wrap">
        {/* Waiting For Filter */}
        <FilterGroup label="Awaiting">
          <FilterChip
            active={waitingFilter === "all"}
            onClick={() => onWaitingFilterChange("all")}
          >
            All
          </FilterChip>
          <FilterChip
            active={waitingFilter === "client"}
            onClick={() => onWaitingFilterChange("client")}
            icon={<Clock className="w-3.5 h-3.5" />}
            color="amber"
          >
            Client Reply
          </FilterChip>
          <FilterChip
            active={waitingFilter === "staff"}
            onClick={() => onWaitingFilterChange("staff")}
            icon={<User className="w-3.5 h-3.5" />}
            color="rose"
          >
            Our Action
          </FilterChip>
        </FilterGroup>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Location Filter */}
        <FilterGroup label="Location">
          <div className="relative">
            <button
              onClick={() => setLocationOpen(!locationOpen)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                locationFilter
                  ? "bg-[#A8B5A0]/15 text-[#6B7D5E] ring-1 ring-[#A8B5A0]/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="max-w-[120px] truncate">
                {locationFilter || "All Locations"}
              </span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-200",
                  locationOpen && "rotate-180"
                )}
              />
            </button>

            <AnimatePresence>
              {locationOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40"
                    onClick={() => setLocationOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-2 z-50 min-w-[180px] max-h-[280px] overflow-y-auto bg-popover border rounded-xl shadow-xl"
                  >
                    <div className="p-1">
                      <button
                        onClick={() => {
                          onLocationFilterChange(null);
                          setLocationOpen(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm rounded-lg transition-colors",
                          !locationFilter
                            ? "bg-[#A8B5A0]/15 text-[#6B7D5E] font-medium"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        All Locations
                      </button>
                      {locations.map((loc) => (
                        <button
                          key={loc}
                          onClick={() => {
                            onLocationFilterChange(loc);
                            setLocationOpen(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left text-sm rounded-lg transition-colors",
                            locationFilter === loc
                              ? "bg-[#A8B5A0]/15 text-[#6B7D5E] font-medium"
                              : "text-foreground hover:bg-muted"
                          )}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </FilterGroup>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Sort Order */}
        <FilterGroup label="Sort">
          <button
            onClick={() =>
              onSortOrderChange(sortOrder === "newest" ? "oldest" : "newest")
            }
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
              "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {sortOrder === "newest" ? (
              <>
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Recent First</span>
              </>
            ) : (
              <>
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Oldest First</span>
              </>
            )}
          </button>
        </FilterGroup>

        {/* Clear All */}
        <AnimatePresence>
          {activeCount > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear filters
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Filters Toggle */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full justify-between",
            activeCount > 0
              ? "bg-[#C9A9A6]/10 text-[#C9A9A6] ring-1 ring-[#C9A9A6]/20"
              : "bg-muted text-muted-foreground"
          )}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span>Filters & Sort</span>
            {activeCount > 0 && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#C9A9A6] text-white text-xs font-bold">
                {activeCount}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform duration-200",
              mobileFiltersOpen && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence>
          {mobileFiltersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 pb-1 space-y-4">
                {/* Mobile: Awaiting Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Awaiting
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <MobileFilterChip
                      active={waitingFilter === "all"}
                      onClick={() => onWaitingFilterChange("all")}
                    >
                      All
                    </MobileFilterChip>
                    <MobileFilterChip
                      active={waitingFilter === "client"}
                      onClick={() => onWaitingFilterChange("client")}
                      color="amber"
                    >
                      <Clock className="w-4 h-4" />
                      Client Reply
                    </MobileFilterChip>
                    <MobileFilterChip
                      active={waitingFilter === "staff"}
                      onClick={() => onWaitingFilterChange("staff")}
                      color="rose"
                    >
                      <User className="w-4 h-4" />
                      Our Action
                    </MobileFilterChip>
                  </div>
                </div>

                {/* Mobile: Location Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Location
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <MobileFilterChip
                      active={!locationFilter}
                      onClick={() => onLocationFilterChange(null)}
                    >
                      All
                    </MobileFilterChip>
                    {locations.slice(0, 6).map((loc) => (
                      <MobileFilterChip
                        key={loc}
                        active={locationFilter === loc}
                        onClick={() => onLocationFilterChange(loc)}
                        color="sage"
                      >
                        {loc}
                      </MobileFilterChip>
                    ))}
                    {locations.length > 6 && (
                      <span className="text-xs text-muted-foreground self-center">
                        +{locations.length - 6} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Mobile: Sort Order */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Sort by Communication
                  </label>
                  <div className="flex gap-2">
                    <MobileFilterChip
                      active={sortOrder === "newest"}
                      onClick={() => onSortOrderChange("newest")}
                    >
                      <ArrowDown className="w-4 h-4" />
                      Recent First
                    </MobileFilterChip>
                    <MobileFilterChip
                      active={sortOrder === "oldest"}
                      onClick={() => onSortOrderChange("oldest")}
                    >
                      <ArrowUp className="w-4 h-4" />
                      Oldest First
                    </MobileFilterChip>
                  </div>
                </div>

                {/* Mobile: Clear All */}
                {activeCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="w-full py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// Filter group wrapper
function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

// Desktop filter chip
function FilterChip({
  active,
  onClick,
  children,
  icon,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  color?: "amber" | "rose" | "sage";
}) {
  const colorStyles = {
    amber: {
      active: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
      inactive: "hover:bg-amber-50",
    },
    rose: {
      active: "bg-[#C9A9A6]/15 text-[#9A7B78] ring-1 ring-[#C9A9A6]/30",
      inactive: "hover:bg-[#C9A9A6]/5",
    },
    sage: {
      active: "bg-[#A8B5A0]/15 text-[#6B7D5E] ring-1 ring-[#A8B5A0]/30",
      inactive: "hover:bg-[#A8B5A0]/5",
    },
  };

  const styles = color ? colorStyles[color] : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
        active
          ? styles?.active || "bg-foreground text-background"
          : cn("bg-muted text-muted-foreground", styles?.inactive)
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// Mobile filter chip (larger touch targets)
function MobileFilterChip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: "amber" | "rose" | "sage";
}) {
  const colorStyles = {
    amber: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
    rose: "bg-[#C9A9A6]/15 text-[#9A7B78] ring-1 ring-[#C9A9A6]/30",
    sage: "bg-[#A8B5A0]/15 text-[#6B7D5E] ring-1 ring-[#A8B5A0]/30",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
        active
          ? color
            ? colorStyles[color]
            : "bg-foreground text-background"
          : "bg-muted text-muted-foreground"
      )}
      style={{ minHeight: "44px" }}
    >
      {children}
    </button>
  );
}
