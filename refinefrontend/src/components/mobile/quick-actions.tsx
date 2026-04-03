import { useState } from "react";
import { Receipt } from "lucide-react";
import { AddExpenseSheet } from "@/components/AddExpenseSheet";

export function QuickActionFab() {
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false);

  return (
    <>
      <div
        className="fixed right-4 z-50 md:hidden"
        style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          onClick={() => setExpenseSheetOpen(true)}
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center"
          style={{
            backgroundColor: "#7C9885",
            minHeight: "56px",
            minWidth: "56px",
          }}
        >
          <Receipt className="h-6 w-6 text-white" />
        </button>
      </div>

      <AddExpenseSheet open={expenseSheetOpen} onOpenChange={setExpenseSheetOpen} />
    </>
  );
}
