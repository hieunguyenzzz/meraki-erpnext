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

export interface VendorFormValue {
  name: string;
  category: string;
  contact: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
}

export const EMPTY_VENDOR_FORM: VendorFormValue = {
  name: "",
  category: "",
  contact: "",
  phone: "",
  email: "",
  website: "",
  notes: "",
};

export interface VendorRow {
  name: string;
  supplier_name: string;
  custom_vendor_category?: string;
  custom_contact_phone?: string;
  custom_contact_email?: string;
  custom_contact_person?: string;
  website?: string;
}

/** Website as an absolute URL ("studio.com" -> "https://studio.com"). */
export function websiteHref(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const TINTS = [
  "bg-success-soft text-success-soft-foreground",
  "bg-info-soft text-info-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-accent text-accent-foreground",
  "bg-secondary text-secondary-foreground",
];

export function tintFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}
