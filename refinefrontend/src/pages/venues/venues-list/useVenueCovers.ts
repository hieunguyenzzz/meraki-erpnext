import { useMemo } from "react";
import { useList } from "@refinedev/core";

/** Maps a venue's cover File name to its image URL, in one request for the whole listing. */
export function useVenueCovers(coverNames: string[]): Record<string, string> {
  const { result, query } = useList<{ name: string; file_url?: string }>({
    resource: "File",
    pagination: { mode: "off" },
    filters: [{ field: "name", operator: "in", value: coverNames }],
    meta: { fields: ["name", "file_url"] },
    queryOptions: { enabled: coverNames.length > 0 },
  });
  if (query.isError) console.error("Venue cover lookup failed", query.error);
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of result?.data ?? []) if (f.file_url) map[f.name] = f.file_url;
    return map;
  }, [result?.data]);
}
