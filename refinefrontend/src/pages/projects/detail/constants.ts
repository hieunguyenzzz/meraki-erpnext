export const WEDDING_PHASES = [
  "Onboarding",
  "Planning",
  "Final Details",
  "Wedding Week",
  "Day-of",
  "Completed",
];

export const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

export const VENDOR_CATEGORIES = [
  "Decoration / Floral",
  "Photography",
  "Videography",
  "Makeup & Hair",
  "MC / Emcee",
  "Music / DJ / Band",
  "Catering",
  "Wedding Cake",
  "Invitation / Stationery",
  "Bridal Attire",
  "Transportation",
  "Lighting / Effects",
];

export function stageBadgeVariant(stage: string) {
  switch (stage) {
    case "Onboarding": return "info" as const;
    case "Planning": return "warning" as const;
    case "Final Details": return "info" as const;
    case "Wedding Week": return "destructive" as const;
    case "Day-of": return "secondary" as const;
    case "Completed": return "success" as const;
    default: return "secondary" as const;
  }
}

export function statusVariant(status: string) {
  switch (status) {
    case "Open": return "warning" as const;
    case "Completed": return "success" as const;
    case "Cancelled": return "destructive" as const;
    default: return "secondary" as const;
  }
}
