import { Link } from "react-router";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { displayName } from "@/lib/format";
import { RoleBadges, StatusBadge } from "./StaffBadges";
import { StaffRowMenu } from "./StaffRowMenu";
import type { StaffRow } from "./types";

interface Props {
  rows: StaffRow[];
  canManageRoles: boolean;
  canReview: boolean;
  dragEnabled: boolean;
  onReview: (row: StaffRow) => void;
  onRoles: (row: StaffRow) => void;
  onDragEnd: (e: DragEndEvent) => void;
}

function Row({ row, canManageRoles, canReview, dragEnabled, onReview, onRoles }: Omit<Props, "rows" | "onDragEnd"> & { row: StaffRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.name, disabled: !dragEnabled });
  const name = displayName(row);
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="border-t bg-card"
    >
      <td className="w-12 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={!dragEnabled}
          title={dragEnabled ? undefined : "Clear search and filters to reorder"}
          aria-label={`Reorder ${name}`}
          className="flex h-10 w-10 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Link to={`/hr/employees/${row.name}`} className="flex items-center gap-2.5 text-foreground hover:underline">
          <StaffAvatar name={name} id={row.name} />
          <span className="flex flex-col">
            <b className="font-semibold">{name}</b>
            {row.user_id && <span className="text-xs font-normal text-muted-foreground">{row.user_id}</span>}
          </span>
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3">{row.designation}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.department}</td>
      <td className="px-4 py-3"><RoleBadges roles={row.staff_roles} /></td>
      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{row.date_of_joining?.slice(0, 10) ?? "\u2014"}</td>
      <td className="whitespace-nowrap px-4 py-3"><StatusBadge row={row} /></td>
      <td className="w-12 px-2 text-right">
        <StaffRowMenu row={row} canManageRoles={canManageRoles} canReview={canReview} onReview={onReview} onRoles={onRoles} />
      </td>
    </tr>
  );
}

/** Desktop staff table in D-Staff style; rows can be dragged to set the display order. */
export function StaffTable({ rows, canManageRoles, canReview, dragEnabled, onReview, onRoles, onDragEnd }: Props) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const th = "whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground";
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="w-12 px-1"><span className="sr-only">Reorder</span></th>
              <th scope="col" className={th}>Name</th>
              <th scope="col" className={th}>Job title</th>
              <th scope="col" className={th}>Department</th>
              <th scope="col" className={th}>App access</th>
              <th scope="col" className={th}>Joined</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className="w-12 px-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.name)} strategy={verticalListSortingStrategy}>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.name} row={r} canManageRoles={canManageRoles} canReview={canReview} dragEnabled={dragEnabled} onReview={onReview} onRoles={onRoles} />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>
    </div>
  );
}
