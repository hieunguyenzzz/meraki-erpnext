/** Turn a failed update_password response into a friendly message (ERPNext may return HTML or server-message JSON). */
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

interface ServerMessage { message?: string; title?: string }

export async function updatePasswordErrorMessage(resp: Response): Promise<string> {
  const data = await resp.json().catch((e) => {
    console.error("[update-password] unreadable error body", resp.status, e);
    return {};
  });

  let rawMsg = "";
  if (data?._server_messages) {
    try {
      const msgs = JSON.parse(data._server_messages) as Array<string | ServerMessage>;
      const first = (typeof msgs[0] === "string" ? JSON.parse(msgs[0]) : msgs[0]) as ServerMessage;
      rawMsg = stripHtml(first?.message || first?.title || "");
    } catch (e) {
      console.error("[update-password] unparseable _server_messages", e);
      rawMsg = stripHtml(String(data._server_messages));
    }
  } else if (data?.exception) {
    rawMsg = stripHtml(String(data.exception).split("ValidationError:").pop() ?? "");
  } else if (data?.message) {
    rawMsg = stripHtml(String(data.message));
  }

  if (resp.status === 429) return "Too many attempts, try again in a few minutes.";
  const lc = rawMsg.toLowerCase();
  if (lc.includes("commonly used") || lc.includes("capitalization") || lc.includes("similar to")) {
    return "This password is too common. Choose something more unique — mix uppercase, lowercase, numbers and symbols. Example: Meraki2026! or Blue#Cloud9";
  }
  if (lc.includes("too short") || lc.includes("at least")) return "Password is too short. Use at least 8 characters.";
  if (lc.includes("expired") || lc.includes("invalid key") || lc.includes("not found")) {
    return "This reset link has expired. Please request a new one from the login page.";
  }
  return rawMsg || "Failed to update password. Please try a different password.";
}
