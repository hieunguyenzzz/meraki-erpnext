import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { yearVN } from "@/lib/businessTime";
import { DesignationsTab } from "./settings/DesignationsTab";
import { HolidaysTab } from "./settings/HolidaysTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { useDesignations, useNotificationRules } from "./settings/useSettingsData";

const TABS = ["designations", "notifications", "holidays"] as const;
const tabParser = parseAsStringLiteral(TABS).withDefault("designations").withOptions({ clearOnDefault: true });

export default function SettingsPage() {
  const [tab, setTab] = useQueryState("tab", tabParser);
  const { designations, query: dq } = useDesignations();
  const { notifications, query: nq } = useNotificationRules();
  const count = (n: number, loading: boolean) => (loading ? "" : ` · ${n}`);

  return (
    <div className="space-y-4 pb-24 md:pb-10">
      <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">Settings</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList className="w-full max-w-full overflow-x-auto md:gap-4">
          <TabsTrigger value="designations" className="max-md:min-h-12">Job titles{count(designations.length, dq.isLoading)}</TabsTrigger>
          <TabsTrigger value="notifications" className="max-md:min-h-12">Email templates{count(notifications.length, nq.isLoading)}</TabsTrigger>
          <TabsTrigger value="holidays" className="max-md:min-h-12">Public holidays · {yearVN()}</TabsTrigger>
        </TabsList>

        <TabsContent value="designations" className="mt-5"><DesignationsTab /></TabsContent>
        <TabsContent value="notifications" className="mt-5"><NotificationsTab /></TabsContent>
        <TabsContent value="holidays" className="mt-5"><HolidaysTab /></TabsContent>
      </Tabs>
    </div>
  );
}
