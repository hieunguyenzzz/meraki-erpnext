import { useEffect } from "react";
import { useNavigate } from "react-router";
import { LayoutDashboard } from "lucide-react";
import { useSearch } from "@/context/search-context";
import { MODULES } from "@/lib/roles";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export function CommandMenu() {
  const { open, setOpen } = useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  function runCommand(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand("/")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          {MODULES.map((mod) =>
            mod.children.map((child) => (
              <CommandItem key={child.path} onSelect={() => runCommand(child.path)}>
                {child.icon && <child.icon className="mr-2 h-4 w-4" />}
                {mod.label} &rsaquo; {child.label}
              </CommandItem>
            ))
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
