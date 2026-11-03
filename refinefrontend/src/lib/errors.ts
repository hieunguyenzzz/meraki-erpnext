export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, any>;
    // Refine wraps errors; check for ERPNext _server_messages in response
    const serverMessages = e?.response?.data?._server_messages
      ?? e?.data?._server_messages
      ?? e?._server_messages;
    if (typeof serverMessages === "string") {
      try {
        const parsed = JSON.parse(serverMessages);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        const msg = typeof first === "string" ? JSON.parse(first) : first;
        if (msg?.message) return msg.message;
      } catch { /* fall through */ }
    }
    // Check common error shapes
    if (e?.response?.data?.exc_type && e?.response?.data?.message) {
      return e.response.data.message;
    }
    if (e?.message && typeof e.message === "string") return e.message;
  }
  return fallback;
}

/** Message from a failed webhook_v2 response body: FastAPI `detail` as a string or a 422 array of `{msg}`. */
export function apiErrorMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d: { msg?: string }) => d?.msg || JSON.stringify(d)).join(", ");
  }
  return fallback;
}
