import { useLocation } from "react-router";
import { MODULES } from "@/lib/roles";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation();
  const pathname = location.pathname;

  if (pathname === "/") {
    return [{ label: "Dashboard" }];
  }

  const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];

  // Match against MODULES
  for (const mod of MODULES) {
    if (pathname.startsWith(mod.path)) {
      crumbs.push({ label: mod.label, href: mod.children[0]?.path });

      for (const child of mod.children) {
        if (pathname === child.path) {
          crumbs.push({ label: child.label });
          return crumbs;
        }
        // Only use startsWith match if the child path differs from the module path
        // (e.g. /crm has a child at /crm which should only exact-match)
        if (child.path !== mod.path && pathname.startsWith(child.path + "/")) {
          crumbs.push({ label: child.label, href: child.path });
          const rest = pathname.slice(child.path.length + 1);
          if (rest) {
            crumbs.push({ label: rest });
          }
          return crumbs;
        }
      }

      // Detail pages under the module that don't match any child (e.g. /crm/leads/LEAD-001)
      const segments = pathname.slice(mod.path.length + 1).split("/").filter(Boolean);
      if (segments.length > 0) {
        // First segment is a sub-section (e.g. "leads"), rest is an ID
        crumbs.push({ label: segments[0].charAt(0).toUpperCase() + segments[0].slice(1) });
        if (segments.length > 1) {
          crumbs.push({ label: segments.slice(1).join("/") });
        }
        return crumbs;
      }

      // Exact module match with a child at the same path (e.g. /crm)
      const exactChild = mod.children.find((c) => c.path === pathname);
      if (exactChild) {
        crumbs.push({ label: exactChild.label });
      }
      return crumbs;
    }
  }

  // Fallback: split path segments
  const segments = pathname.split("/").filter(Boolean);
  segments.forEach((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    if (i === segments.length - 1) {
      crumbs.push({ label: seg.charAt(0).toUpperCase() + seg.slice(1) });
    } else {
      crumbs.push({ label: seg.charAt(0).toUpperCase() + seg.slice(1), href });
    }
  });

  return crumbs;
}
