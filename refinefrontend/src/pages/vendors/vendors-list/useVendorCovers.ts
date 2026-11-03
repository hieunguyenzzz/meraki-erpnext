import { useQuery } from "@tanstack/react-query";

const CHUNK = 50;

async function fetchChunk(names: string[]): Promise<{ file_url: string; attached_to_name: string }[]> {
  const params = new URLSearchParams({
    fields: JSON.stringify(["file_url", "attached_to_name"]),
    filters: JSON.stringify([
      ["attached_to_doctype", "=", "Supplier"],
      ["attached_to_name", "in", names],
    ]),
    limit_page_length: "0",
  });
  const res = await fetch(`/api/resource/File?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Vendor covers failed: ${res.status}`);
  return (await res.json()).data ?? [];
}

/** First image attached to each vendor, looked up in batches so the URL stays short. */
export function useVendorCovers(names: string[]): Record<string, string> {
  const { data } = useQuery({
    queryKey: ["vendor-covers", names],
    enabled: names.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      for (let i = 0; i < names.length; i += CHUNK) {
        for (const f of await fetchChunk(names.slice(i, i + CHUNK))) {
          if (!map[f.attached_to_name] && /\.(jpg|jpeg|png|webp)$/i.test(f.file_url)) map[f.attached_to_name] = f.file_url;
        }
      }
      return map;
    },
  });
  return data ?? {};
}
