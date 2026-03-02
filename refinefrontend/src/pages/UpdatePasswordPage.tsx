import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeSwitch } from "@/components/theme-switch";
import { CheckCircle2 } from "lucide-react";

export default function UpdatePasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const key = searchParams.get("key") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!key) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>This password reset link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) { setError("Please enter a new password"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters"); return; }

    setSubmitting(true);
    setError("");

    try {
      const resp = await fetch("/api/method/frappe.core.doctype.user.user.update_password", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Frappe-Site-Name": "erp.merakiwp.com",
        },
        body: new URLSearchParams({ new_password: newPassword, key, logout_all_sessions: "1" }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));

        // ERPNext may return HTML in error messages — strip tags and map to friendly messages
        const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

        let rawMsg = "";
        if (data?._server_messages) {
          try {
            const msgs = JSON.parse(data._server_messages) as any[];
            const first = typeof msgs[0] === "string" ? JSON.parse(msgs[0]) : msgs[0];
            rawMsg = stripHtml(first?.message || first?.title || "");
          } catch {
            rawMsg = stripHtml(data._server_messages);
          }
        } else if (data?.exception) {
          rawMsg = stripHtml(data.exception.split("ValidationError:").pop() ?? "");
        } else if (data?.message) {
          rawMsg = stripHtml(data.message);
        }

        // Map technical ERPNext messages to friendly, specific guidance
        const lc = rawMsg.toLowerCase();
        let msg: string;
        if (lc.includes("commonly used") || lc.includes("capitalization") || lc.includes("similar to")) {
          msg = "This password is too common. Choose something more unique — mix uppercase, lowercase, numbers and symbols. Example: Meraki2026! or Blue#Cloud9";
        } else if (lc.includes("too short") || lc.includes("at least")) {
          msg = "Password is too short. Use at least 8 characters.";
        } else if (lc.includes("expired") || lc.includes("invalid key") || lc.includes("not found")) {
          msg = "This reset link has expired. Please request a new one from the login page.";
        } else {
          msg = rawMsg || "Failed to update password. Please try a different password.";
        }

        throw new Error(msg);
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Failed to update password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="absolute top-4 right-4">
        <ThemeSwitch />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Set New Password</CardTitle>
          <CardDescription>
            {success ? "Your password has been updated." : "Enter your new password below."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                Password updated successfully.
              </div>
              <Button className="w-full" onClick={() => navigate("/login")}>
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Use a unique password — avoid common words or names.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Updating..." : "Update Password"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => navigate("/login")}
              >
                ← Back to Login
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
