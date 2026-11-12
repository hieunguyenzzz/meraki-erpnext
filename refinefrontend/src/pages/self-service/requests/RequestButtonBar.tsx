import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Primary action kept in thumb reach above the bottom bar on phones (desktop has it in the page header). */
export function RequestButtonBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="sticky bottom-3 z-10 mt-4 md:hidden">
      <Button className="h-[52px] w-full text-base shadow-lg" onClick={onClick}>
        <Plus aria-hidden />
        {label}
      </Button>
    </div>
  );
}
