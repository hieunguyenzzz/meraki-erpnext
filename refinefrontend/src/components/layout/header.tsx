import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PanelLeft, Search } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useSearch } from "@/context/search-context";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { ThemeSwitch } from "@/components/theme-switch";
import { UserNav } from "@/components/layout/user-nav";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

export function Header() {
  const { collapsed, setCollapsed } = useSidebar();
  const { setOpen: setSearchOpen } = useSearch();
  const crumbs = useBreadcrumbs();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    const handler = () => setScrolled(main.scrollTop > 10);
    main.addEventListener("scroll", handler, { passive: true });
    return () => main.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 px-4 transition-shadow ${
        scrolled ? "shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60" : ""
      }`}
    >
      {/* Left: sidebar toggle + breadcrumbs */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeft className="h-4 w-4" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
        <Separator orientation="vertical" className="h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <BreadcrumbItem key={i}>
                  {i > 0 && <BreadcrumbSeparator />}
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href ?? "/"}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right: search + theme + user */}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 lg:h-8 lg:w-[200px] lg:justify-start lg:px-3 lg:py-2"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4 lg:mr-2" />
          <span className="hidden lg:inline-flex text-muted-foreground">Search...</span>
          <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 lg:inline-flex">
            <span className="text-xs">Ctrl</span>K
          </kbd>
        </Button>
        <ThemeSwitch />
        <UserNav />
      </div>
    </header>
  );
}
