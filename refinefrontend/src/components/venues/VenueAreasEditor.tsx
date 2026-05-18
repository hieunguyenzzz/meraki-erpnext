import { useState } from "react";
import { Plus, Trash2, Copy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { VenueWeddingArea } from "@/lib/types";

type EditorArea = VenueWeddingArea & { _clientId?: string };

function generateClientId(): string {
  return `c_${Math.random().toString(36).slice(2, 11)}`;
}

const AREA_TYPE_OPTIONS: Array<VenueWeddingArea["area_type"]> = [
  "Ballroom/Indoor",
  "Lawn",
  "Beach",
  "Restaurant/Café/Bar",
  "Pool",
  "Other",
];

const AREA_TYPE_NONE = "__none__" as const;

interface VenueAreasEditorProps {
  areas: VenueWeddingArea[];
  onChange: (next: VenueWeddingArea[]) => void;
  errors?: Record<number, Partial<Record<keyof VenueWeddingArea, string>>>;
}

function capacitySummary(area: VenueWeddingArea): string {
  const min = area.capacity_min;
  const max = area.capacity_max;
  if (min == null && max == null) return "(no capacity)";
  if (min != null && max != null) return `${min}–${max} pax`;
  if (min != null) return `${min}+ pax`;
  return `up to ${max} pax`;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function VenueAreasEditor({ areas, onChange, errors = {} }: VenueAreasEditorProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState<number | null>(null);

  function toggleExpanded(idx: number) {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function updateArea(idx: number, patch: Partial<VenueWeddingArea>) {
    const next = areas.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onChange(next);
  }

  function addArea() {
    const newArea: EditorArea = { name: "", area_name: "", _clientId: generateClientId() };
    const newIdx = areas.length;
    onChange([...areas, newArea]);
    setExpandedIndices((prev) => new Set(prev).add(newIdx));
  }

  function duplicateArea(idx: number) {
    const clone: EditorArea = { ...areas[idx], name: "", _clientId: generateClientId() };
    const newIdx = areas.length;
    onChange([...areas, clone]);
    setExpandedIndices((prev) => new Set(prev).add(newIdx));
  }

  function requestDelete(idx: number) {
    const area = areas[idx];
    // Areas with an existing DB name (non-empty) require confirmation
    if (area.name) {
      setPendingDeleteIdx(idx);
    } else {
      deleteArea(idx);
    }
  }

  function deleteArea(idx: number) {
    const next = areas.filter((_, i) => i !== idx);
    onChange(next);
    setExpandedIndices((prev) => {
      const next2 = new Set<number>();
      for (const i of prev) {
        if (i < idx) next2.add(i);
        else if (i > idx) next2.add(i - 1);
      }
      return next2;
    });
    setPendingDeleteIdx(null);
  }

  return (
    <div className="space-y-3">
      {areas.map((area, idx) => {
        const isExpanded = expandedIndices.has(idx);
        const fieldErrors = errors[idx] ?? {};

        const key = area.name || (area as EditorArea)._clientId || `fallback-${idx}`;

        return (
          <Card
            key={key}
            className={`border transition-shadow ${isExpanded ? "shadow-md" : "shadow-sm hover:shadow"}`}
          >
            {/* Collapsed / header row */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
              onClick={() => toggleExpanded(idx)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleExpanded(idx);
                }
              }}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="font-medium text-sm truncate">
                  {area.area_name || <span className="text-muted-foreground italic">Untitled area</span>}
                </span>
                <span className="text-muted-foreground text-sm hidden sm:inline">
                  · {capacitySummary(area)}
                </span>
              </div>

              <div
                className="flex items-center gap-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Duplicate area"
                  onClick={() => duplicateArea(idx)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Delete area"
                  onClick={() => requestDelete(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Expanded form */}
            {isExpanded && (
              <CardContent className="pt-0 pb-4 px-4 border-t">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {/* Area Name */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor={`area-name-${idx}`}>
                      Area Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`area-name-${idx}`}
                      value={area.area_name}
                      onChange={(e) => updateArea(idx, { area_name: e.target.value })}
                      className={fieldErrors.area_name ? "border-destructive" : ""}
                    />
                    {fieldErrors.area_name && (
                      <p className="text-xs text-destructive">{fieldErrors.area_name}</p>
                    )}
                  </div>

                  {/* Area Type */}
                  <div className="space-y-1">
                    <Label htmlFor={`area-type-${idx}`}>Area Type</Label>
                    <Select
                      value={area.area_type ?? AREA_TYPE_NONE}
                      onValueChange={(val) =>
                        updateArea(idx, {
                          area_type:
                            val === AREA_TYPE_NONE
                              ? undefined
                              : (val as VenueWeddingArea["area_type"]),
                        })
                      }
                    >
                      <SelectTrigger id={`area-type-${idx}`}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AREA_TYPE_NONE}>— None —</SelectItem>
                        {AREA_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt!}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Capacity Min */}
                  <div className="space-y-1">
                    <Label htmlFor={`cap-min-${idx}`}>Capacity Min</Label>
                    <Input
                      id={`cap-min-${idx}`}
                      type="number"
                      min={0}
                      value={area.capacity_min ?? ""}
                      onChange={(e) =>
                        updateArea(idx, {
                          capacity_min: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>

                  {/* Capacity Max */}
                  <div className="space-y-1">
                    <Label htmlFor={`cap-max-${idx}`}>Capacity Max</Label>
                    <Input
                      id={`cap-max-${idx}`}
                      type="number"
                      min={0}
                      value={area.capacity_max ?? ""}
                      onChange={(e) =>
                        updateArea(idx, {
                          capacity_max: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>

                  {/* Capacity Notes */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor={`cap-notes-${idx}`}>Capacity Notes</Label>
                    <Input
                      id={`cap-notes-${idx}`}
                      value={area.capacity_notes ?? ""}
                      onChange={(e) => updateArea(idx, { capacity_notes: e.target.value })}
                    />
                  </div>

                  {/* Function */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor={`function-${idx}`}>Function</Label>
                    <Textarea
                      id={`function-${idx}`}
                      rows={2}
                      value={area.function ?? ""}
                      onChange={(e) => updateArea(idx, { function: e.target.value })}
                    />
                  </div>

                  {/* Policy Min Spend */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor={`policy-${idx}`}>Policy / Min Spend</Label>
                    <Textarea
                      id={`policy-${idx}`}
                      rows={3}
                      value={area.policy_min_spend ?? ""}
                      onChange={(e) => updateArea(idx, { policy_min_spend: e.target.value })}
                    />
                  </div>

                  {/* Setup Notes */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor={`setup-${idx}`}>Setup Notes</Label>
                    <Textarea
                      id={`setup-${idx}`}
                      rows={3}
                      value={area.setup_notes ?? ""}
                      onChange={(e) => updateArea(idx, { setup_notes: e.target.value })}
                    />
                  </div>

                  {/* Meraki Weddings */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor={`meraki-weddings-${idx}`}>Meraki Weddings</Label>
                    <Textarea
                      id={`meraki-weddings-${idx}`}
                      rows={2}
                      value={area.meraki_weddings ?? ""}
                      onChange={(e) => updateArea(idx, { meraki_weddings: e.target.value })}
                    />
                  </div>

                  {/* Photos URL */}
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor={`photos-url-${idx}`}>Photos URL</Label>
                    <Input
                      id={`photos-url-${idx}`}
                      type="url"
                      value={area.photos_url ?? ""}
                      onChange={(e) => updateArea(idx, { photos_url: e.target.value })}
                      className={
                        area.photos_url && !isValidUrl(area.photos_url)
                          ? "border-destructive"
                          : ""
                      }
                    />
                    {area.photos_url && !isValidUrl(area.photos_url) && (
                      <p className="text-xs text-destructive">Must be a valid URL</p>
                    )}
                    {fieldErrors.photos_url && (
                      <p className="text-xs text-destructive">{fieldErrors.photos_url}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Add area button */}
      <Button type="button" variant="outline" size="sm" onClick={addArea} className="w-full">
        <Plus className="h-4 w-4 mr-1" />
        Add area
      </Button>

      {/* Delete confirm dialog */}
      <Dialog
        open={pendingDeleteIdx !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteIdx(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete wedding area?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove{" "}
            <span className="font-medium">
              {pendingDeleteIdx !== null ? (areas[pendingDeleteIdx]?.area_name || "this area") : ""}
            </span>{" "}
            from the venue. The change takes effect when you save the venue.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDeleteIdx(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => pendingDeleteIdx !== null && deleteArea(pendingDeleteIdx)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
