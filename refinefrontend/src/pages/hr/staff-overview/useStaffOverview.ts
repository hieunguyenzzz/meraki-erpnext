import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import type { StaffOverviewData, StaffRow } from "./types";

/** Loads the staff overview and roles map, and keeps the drag order (saved via /employee-order). */
export function useStaffOverview() {
  const [overviewData, setOverviewData] = useState<StaffOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [fetchVersion, setFetchVersion] = useState(0);
  const [rolesMap, setRolesMap] = useState<Record<string, string[]>>({});
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);
  const pendingSave = useRef(false);
  const orderRef = useRef<string[]>([]);
  const savedOrder = useRef<string[]>([]);
  const [orderError, setOrderError] = useState<string | null>(null);

  const refetch = useCallback(() => setFetchVersion((v) => v + 1), []);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    fetch("/inquiry-api/staff/overview", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Staff overview failed: ${r.status}`);
        return r.json();
      })
      .then((data) => setOverviewData(data))
      .catch((err) => {
        console.error("Staff overview failed", err);
        setOverviewData(null);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, [fetchVersion]);

  useEffect(() => {
    if (!overviewData?.data?.length) return;
    fetch("/inquiry-api/employees/roles-map", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Roles map failed: ${r.status}`);
        return r.json();
      })
      .then((data) => setRolesMap(data ?? {}))
      .catch((err) => {
        console.error("Roles map failed", err);
        setRolesMap({});
      });
  }, [overviewData?.data?.length]);

  const staffData: StaffRow[] = useMemo(() => {
    if (!overviewData?.data) return [];
    return overviewData.data.map((emp) => ({
      name: emp.name,
      employee_name: emp.employee_name,
      first_name: emp.first_name,
      last_name: emp.last_name,
      designation: emp.designation,
      department: emp.department,
      date_of_joining: emp.date_of_joining,
      custom_last_review_date: emp.custom_last_review_date,
      custom_review_notes: emp.custom_review_notes,
      custom_display_order: emp.custom_display_order,
      user_id: emp.user_id,
      staff_roles: rolesMap[emp.name] ?? [],
      is_probation: !!emp.is_probation,
      leave_allocated: emp.leave_allocated,
      leave_taken: emp.leave_taken,
      leave_remaining: emp.leave_remaining,
    }));
  }, [overviewData, rolesMap]);

  // Initialise order from custom_display_order when data loads (not while a reorder save is in flight)
  useEffect(() => {
    if (staffData.length === 0 || pendingSave.current) return;
    const sorted = [...staffData].sort((a, b) => {
      const oa = a.custom_display_order || 0;
      const ob = b.custom_display_order || 0;
      if (oa === 0 && ob === 0) return (a.employee_name || "").localeCompare(b.employee_name || "");
      if (oa === 0) return 1;
      if (ob === 0) return -1;
      return oa - ob;
    });
    const ids = sorted.map((e) => e.name);
    orderRef.current = ids;
    savedOrder.current = ids;
    setOrderedIds(ids);
  }, [staffData]);

  const orderedStaff = useMemo(() => {
    const map = Object.fromEntries(staffData.map((e) => [e.name, e]));
    return orderedIds.map((id) => map[id]).filter(Boolean) as StaffRow[];
  }, [orderedIds, staffData]);

  function saveOrderDebounced(ids: string[]) {
    const seq = ++saveSeq.current;
    pendingSave.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      let failure: string | null = null;
      try {
        const res = await fetch("/inquiry-api/employee-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: ids.map((id, index) => ({ employee: id, order: index + 1 })) }),
        });
        if (!res.ok) failure = `Saving staff order failed (${res.status})`;
      } catch (err) {
        console.error("Saving staff order failed", err);
        failure = "Saving staff order failed";
      }
      if (seq !== saveSeq.current) return; // a newer reorder owns the result
      pendingSave.current = false;
      if (failure) {
        console.error(failure);
        orderRef.current = savedOrder.current;
        setOrderedIds(savedOrder.current);
        setOrderError("Couldn't save the new order. The previous order was restored.");
      } else {
        savedOrder.current = ids;
      }
    }, 400);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderRef.current;
    const next = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    orderRef.current = next;
    setOrderedIds(next);
    setOrderError(null);
    saveOrderDebounced(next);
  }

  return {
    summary: overviewData?.summary,
    total: overviewData?.data?.length ?? 0,
    orderedStaff,
    isLoading,
    isError,
    orderError,
    refetch,
    setRolesMap,
    handleDragEnd,
  };
}
