import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface TypeCount {
  type: string;
  total: number;
  unread: number;
}

interface Props {
  types: TypeCount[];
  selected: string; // "" = All
  onSelect: (type: string) => void;
  labelFor: (type: string) => string;
}

export function NotificationTypeFilter({ types, selected, onSelect, labelFor }: Props) {
  const allUnread = types.reduce((sum, t) => sum + t.unread, 0);
  const chips = [
    { type: "", label: "All", unread: allUnread },
    ...types.map((t) => ({ type: t.type, label: labelFor(t.type), unread: t.unread })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Button
          key={chip.type || "__all__"}
          size="sm"
          variant={selected === chip.type ? "default" : "outline"}
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => onSelect(chip.type)}
        >
          {chip.label}
          {chip.unread > 0 && (
            <Badge variant="info" className="ml-1.5 px-1.5 py-0 text-[10px]">
              {chip.unread}
            </Badge>
          )}
        </Button>
      ))}
    </div>
  );
}
