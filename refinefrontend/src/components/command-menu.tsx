import { useEffect } from "react";
import { useNavigate } from "react-router";
import { usePermissions } from "@refinedev/core";
import { useSearch } from "@/context/search-context";
import { getPaletteGroups } from "@/lib/navigation";
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
  const { data: roles } = usePermissions<string[]>({});

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
      <CommandInput placeholder="Jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {getPaletteGroups(roles ?? []).map((g) => (
          <CommandGroup key={g.heading} heading={g.heading}>
            {g.items.map((item) => (
              <CommandItem
                key={item.path}
                value={`${g.heading} ${item.label}`}
                onSelect={() => runCommand(item.path)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
