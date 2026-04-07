import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatVND, formatDate } from "@/lib/format";

interface Project {
  name: string;
  project_name: string;
  expected_end_date: string | null;
}

interface ExpenseRow {
  name: string;
  posting_date: string;
  description: string;
  amount: number;
  category: string;
  category_label: string;
  status: "Approved" | "Pending" | "Rejected";
  staff: string;
  staff_name: string;
  supplier_name: string;
}

interface ExpenseSummary {
  total: number;
  approved: number;
  pending: number;
  count: number;
}

type GroupBy = "all" | "category" | "date";

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  Approved: "success",
  Pending: "secondary",
  Rejected: "destructive",
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function WeddingExpenseReportPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("__none__");
  const [selectedMonth, setSelectedMonth] = useState<string>("__none__");
  const [selectedProject, setSelectedProject] = useState("");
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("all");

  // Fetch project list on mount
  useEffect(() => {
    fetch("/inquiry-api/reports/wedding-expenses/projects", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const data = d.data ?? [];
        setProjects(data);
        // Default to current year
        const currentYear = String(new Date().getFullYear());
        const years = new Set(data.map((p: Project) => p.expected_end_date?.slice(0, 4)).filter(Boolean));
        if (years.has(currentYear)) setSelectedYear(currentYear);
      })
      .catch(() => setProjects([]));
  }, []);

  // Derive available years from projects
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects) {
      const y = p.expected_end_date?.slice(0, 4);
      if (y) s.add(y);
    }
    return Array.from(s).sort().reverse();
  }, [projects]);

  // Derive available months for selected year
  const months = useMemo(() => {
    if (selectedYear === "__none__") return [];
    const s = new Set<number>();
    for (const p of projects) {
      if (p.expected_end_date?.startsWith(selectedYear)) {
        const m = parseInt(p.expected_end_date.slice(5, 7), 10);
        if (m >= 1 && m <= 12) s.add(m);
      }
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [projects, selectedYear]);

  // Filter projects by year + month
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (!p.expected_end_date) return false;
      if (selectedYear !== "__none__" && !p.expected_end_date.startsWith(selectedYear)) return false;
      if (selectedMonth !== "__none__") {
        const m = String(parseInt(selectedMonth, 10)).padStart(2, "0");
        if (p.expected_end_date.slice(5, 7) !== m) return false;
      }
      return true;
    });
  }, [projects, selectedYear, selectedMonth]);

  // Reset downstream selections when filters change
  useEffect(() => { setSelectedMonth("__none__"); setSelectedProject(""); }, [selectedYear]);
  useEffect(() => { setSelectedProject(""); }, [selectedMonth]);

  // Fetch expenses when project changes
  useEffect(() => {
    if (!selectedProject) {
      setRows([]);
      setSummary(null);
      return;
    }
    setIsLoading(true);
    fetch(`/inquiry-api/reports/wedding-expenses?project=${encodeURIComponent(selectedProject)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.data ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => {
        setRows([]);
        setSummary(null);
      })
      .finally(() => setIsLoading(false));
  }, [selectedProject]);

  // Group rows
  const grouped = useMemo(() => {
    if (groupBy === "all") return null;
    const map = new Map<string, { label: string; rows: ExpenseRow[]; subtotal: number }>();
    for (const row of rows) {
      const key = groupBy === "category" ? (row.category_label || "Uncategorized") : row.posting_date;
      const label = groupBy === "category" ? (row.category_label || "Uncategorized") : formatDate(row.posting_date);
      if (!map.has(key)) map.set(key, { label, rows: [], subtotal: 0 });
      const g = map.get(key)!;
      g.rows.push(row);
      g.subtotal += row.amount;
    }
    return Array.from(map.values());
  }, [rows, groupBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wedding Expense Report</h1>
          <p className="text-muted-foreground">View detailed expenses per wedding</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={selectedYear === "__none__"}>
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All months</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={String(m)}>{MONTH_LABELS[m - 1]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedProject || "__none__"} onValueChange={(v) => setSelectedProject(v === "__none__" ? "" : v)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select wedding..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select wedding...</SelectItem>
              {filteredProjects.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.project_name || p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {summary
                ? `${summary.count} expenses · ${formatVND(summary.total)}`
                : "Expenses"}
            </CardTitle>
            {selectedProject && rows.length > 0 && (
              <div className="flex gap-1">
                {(["all", "category", "date"] as GroupBy[]).map((g) => (
                  <Button
                    key={g}
                    variant={groupBy === g ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGroupBy(g)}
                  >
                    {g === "all" ? "All" : g === "category" ? "By Category" : "By Date"}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading expenses...
            </div>
          ) : !selectedProject ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Select a wedding to view expenses
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="min-w-[100px]">Date</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead className="min-w-[150px]">Category</TableHead>
                    <TableHead className="min-w-[140px]">Staff</TableHead>
                    <TableHead className="min-w-[120px] text-right">Amount</TableHead>
                    <TableHead className="min-w-[90px] text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No expenses found for this wedding
                      </TableCell>
                    </TableRow>
                  ) : grouped ? (
                    grouped.map((group) => (
                      <>
                        <TableRow key={`header-${group.label}`} className="bg-muted/30">
                          <TableCell colSpan={4} className="font-semibold text-sm">
                            {group.label}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            {formatVND(group.subtotal)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                        {group.rows.map((row) => (
                          <ExpenseTableRow key={row.name} row={row} />
                        ))}
                      </>
                    ))
                  ) : (
                    rows.map((row) => <ExpenseTableRow key={row.name} row={row} />)
                  )}
                  {rows.length > 0 && (
                    <TableRow className="bg-muted font-bold">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-right">{formatVND(summary?.total)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && summary.pending > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatVND(summary.approved)} approved · {formatVND(summary.pending)} pending approval
        </p>
      )}
    </div>
  );
}

function ExpenseTableRow({ row }: { row: ExpenseRow }) {
  return (
    <TableRow>
      <TableCell className="text-sm">{formatDate(row.posting_date)}</TableCell>
      <TableCell className="text-sm">{row.description}</TableCell>
      <TableCell className="text-sm">{row.category_label}</TableCell>
      <TableCell className="text-sm">{row.staff_name}</TableCell>
      <TableCell className="text-sm text-right">{formatVND(row.amount)}</TableCell>
      <TableCell className="text-center">
        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"} className="text-xs">
          {row.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
