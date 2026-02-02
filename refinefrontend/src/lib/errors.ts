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
