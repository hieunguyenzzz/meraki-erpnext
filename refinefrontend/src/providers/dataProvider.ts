import type { DataProvider } from "@refinedev/core";

const API_BASE = "/api";

function mapOperator(op: string): string {
  const map: Record<string, string> = {
    eq: "=",
    ne: "!=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    contains: "like",
    ncontains: "not like",
    in: "in",
    nin: "not in",
  };
  return map[op] ?? "=";
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-Site-Name": "erp.merakiwp.com",
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const dataProvider: DataProvider = {
  getList: async ({ resource, pagination, sorters, filters, meta }) => {
    const params = new URLSearchParams();

    // Fields
    const fields = meta?.fields ?? ["name"];
    params.set("fields", JSON.stringify(fields));

    // Filters
    if (filters && filters.length > 0) {
      const frappeFilters = filters.map((f) => {
        if ("field" in f) {
          const op = mapOperator(f.operator);
          let val = f.value;
          if (op === "like" || op === "not like") {
            val = `%${val}%`;
          }
          return [resource, f.field, op, val];
        }
        return null;
      }).filter(Boolean);
      if (frappeFilters.length > 0) {
        params.set("filters", JSON.stringify(frappeFilters));
      }
    }

    // Raw filters escape hatch (for child table queries)
    if (meta?.rawFilters) {
      params.set("filters", JSON.stringify(meta.rawFilters));
    }

    // Sorting
    if (sorters && sorters.length > 0) {
      const orderBy = sorters
        .map((s) => `${s.field} ${s.order}`)
        .join(", ");
      params.set("order_by", orderBy);
    }

    // Pagination
    if (pagination?.mode === "off") {
      params.set("limit_page_length", "0");
    } else {
      const current = pagination?.currentPage ?? 1;
      const pageSize = pagination?.pageSize ?? 20;
      params.set("limit_start", String((current - 1) * pageSize));
      params.set("limit_page_length", String(pageSize));
    }

    const json = await apiFetch(`${API_BASE}/resource/${resource}?${params.toString()}`);
    const data = json.data ?? [];

    // Frappe list API doesn't return total count.
    // For unpaginated requests, total = data.length.
    // For paginated requests, fetch count separately.
    let total = data.length;
    if (pagination?.mode !== "off" && data.length > 0) {
      const countParams = new URLSearchParams();
      if (filters && filters.length > 0) {
        countParams.set("filters", params.get("filters") ?? "[]");
      }
      try {
        const countJson = await apiFetch(
          `${API_BASE}/method/frappe.client.get_count?doctype=${encodeURIComponent(resource)}&${countParams.toString()}`
        );
        total = countJson.message ?? data.length;
      } catch {
        total = data.length;
      }
    }

    return { data, total };
  },

  getOne: async ({ resource, id }) => {
    const json = await apiFetch(`${API_BASE}/resource/${resource}/${id}`);
    return { data: json.data };
  },

  create: async ({ resource, variables }) => {
    const json = await apiFetch(`${API_BASE}/resource/${resource}`, {
      method: "POST",
      body: JSON.stringify(variables),
    });
    return { data: json.data };
  },

  update: async ({ resource, id, variables }) => {
    const json = await apiFetch(`${API_BASE}/resource/${resource}/${id}`, {
      method: "PUT",
      body: JSON.stringify(variables),
    });
    return { data: json.data };
  },

  deleteOne: async ({ resource, id }) => {
    const json = await apiFetch(`${API_BASE}/resource/${resource}/${id}`, {
      method: "DELETE",
    });
    return { data: json.data };
  },

  getApiUrl: () => API_BASE,

  custom: async ({ url, method, payload }) => {
    const json = await apiFetch(url, {
      method: (method ?? "GET").toUpperCase(),
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return { data: json };
  },
};
