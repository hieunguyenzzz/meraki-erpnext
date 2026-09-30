import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVND } from "@/lib/format";

interface MySlip {
  name: string;
  start_date: string;
  net_pay: number;
}

interface MySlipsResponse {
  employee: { name: string; display_name: string } | null;
  data: MySlip[];
}

function monthLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function MyPayrollCard() {
  const [response, setResponse] = useState<MySlipsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/inquiry-api/payroll/my-slips")
      .then((r) => (r.ok ? r.json() : { employee: null, data: [] }))
      .then((json: MySlipsResponse) => { if (!cancelled) setResponse(json); })
      .catch(() => { if (!cancelled) setResponse({ employee: null, data: [] }); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            My Payroll
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-[120px]" />
        </CardContent>
      </Card>
    );
  }

  const latest = response?.data?.[0];
  if (!latest) return null;

  return (
    <Link to="/my-payroll" className="block">
      <Card className="hover:bg-accent transition-colors h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            My Payroll
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{formatVND(latest.net_pay)}</span>
            <span className="text-sm text-muted-foreground">net, {monthLabel(latest.start_date)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
