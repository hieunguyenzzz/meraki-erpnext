import { useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthIcon } from "@/components/auth/AuthIcon";
import { PasswordField } from "@/components/auth/PasswordField";
import { updatePasswordErrorMessage } from "@/components/auth/updatePasswordError";

const primaryBtn = "h-12 w-full text-base md:h-[54px]";
const linkBtn =
  "inline-flex h-11 items-center justify-center rounded-md text-[15px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function UpdatePasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const key = searchParams.get("key") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!key) {
    return (
      <AuthShell>
        <div role="alert" className="flex flex-col items-center gap-3.5 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger-soft text-destructive" aria-hidden="true">
            <AlertCircle className="h-9 w-9" strokeWidth={1.75} />
          </div>
          <h1 className="text-[22px] font-semibold">Invalid link</h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground">
            This password reset link is invalid or has expired.
          </p>
          <Button className={primaryBtn} onClick={() => navigate("/login")}>
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!newPassword) { setError("Please enter a new password"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters"); return; }

    submittingRef.current = true;
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
        console.error("[update-password] failed", resp.status);
        setError(await updatePasswordErrorMessage(resp));
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error("[update-password] request failed", err);
      setError("Failed to update password. The link may have expired.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <AuthShell>
        <div role="status" className="flex flex-col items-center gap-3.5 text-center">
          <AuthIcon>
            <CheckCircle2 className="h-9 w-9" strokeWidth={1.75} />
          </AuthIcon>
          <h1 className="text-[22px] font-semibold">Password updated</h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground">Your password has been updated. Sign in with the new one.</p>
          <Button className={primaryBtn} onClick={() => navigate("/login")}>
            Go to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  const describedBy = error ? "update-error" : undefined;
  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label="Set a new password">
        <h1 className="text-[22px] font-semibold">Set a new password</h1>
        <p className="-mt-2 text-[15px] leading-[22px] text-muted-foreground">
          Use a unique password — avoid common words or names.
        </p>
        <PasswordField
          id="new-password"
          name="new_password"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoFocus
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <PasswordField
          id="confirm-password"
          name="confirm_password"
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        {error && <AuthAlert id="update-error">{error}</AuthAlert>}
        <Button type="submit" className={primaryBtn} disabled={submitting}>
          {submitting ? "Updating..." : "Update password"}
        </Button>
        <button type="button" className={linkBtn} onClick={() => navigate("/login")}>
          Back to sign in
        </button>
      </form>
    </AuthShell>
  );
}
