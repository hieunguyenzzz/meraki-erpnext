import { useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { AuthShell, CardWordmark } from "@/components/auth/AuthShell";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthIcon } from "@/components/auth/AuthIcon";
import { PasswordField } from "@/components/auth/PasswordField";
import { PasswordStrength, MIN_PASSWORD_LENGTH } from "@/components/auth/PasswordStrength";
import { updatePasswordErrorMessage, EXPIRED_LINK_MESSAGE } from "@/components/auth/updatePasswordError";

const primaryBtn = "h-12 w-full text-base md:h-[54px] lg:h-[52px]";
const linkBtn =
  "inline-flex h-11 max-md:h-12 items-center justify-center rounded-md text-[15px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function UpdatePasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const key = searchParams.get("key") ?? "";
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [expired, setExpired] = useState(false);

  if (!key || expired) {
    return (
      <AuthShell card>
        <div role="alert" className="flex flex-col items-center gap-3.5 text-center lg:gap-4">
          <AuthIcon tone="warning">
            <Clock className="h-9 w-9 lg:h-[30px] lg:w-[30px]" strokeWidth={1.75} />
          </AuthIcon>
          <h1 className="text-[22px] font-semibold lg:text-2xl">This link has expired</h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground lg:leading-[23px]">
            Reset links work only once and for a limited time. Ask for a fresh one and use it straight away.
          </p>
          <Button className={`${primaryBtn} lg:w-auto lg:px-7`} onClick={() => navigate("/login?forgot=1")}>
            Send a new link
          </Button>
          <button type="button" className={linkBtn} onClick={() => navigate("/login")}>
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!newPassword) { setError("Please enter a new password"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`); return; }

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
        const message = await updatePasswordErrorMessage(resp);
        if (message === EXPIRED_LINK_MESSAGE) setExpired(true);
        else setError(message);
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
      <AuthShell card>
        <div role="status" className="flex flex-col items-center gap-3.5 text-center lg:gap-4">
          <AuthIcon>
            <CheckCircle2 className="h-9 w-9 lg:h-[30px] lg:w-[30px]" strokeWidth={1.75} />
          </AuthIcon>
          <h1 className="text-[22px] font-semibold lg:text-2xl">Password updated</h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground lg:leading-[23px]">Your password has been updated. Sign in with the new one.</p>
          <Button className={primaryBtn} onClick={() => navigate("/login")}>
            Go to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  const describedBy = error ? "update-error" : undefined;
  return (
    <AuthShell card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label="Set a new password">
        <CardWordmark />
        <h1 className="text-[22px] font-semibold lg:text-2xl">Set a new password</h1>
        <p className="-mt-2 text-[15px] leading-[22px] text-muted-foreground lg:hidden">
          Use a unique password — avoid common words or names.
        </p>
        <PasswordField
          id="new-password"
          name="new_password"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoFocus={isDesktop}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <PasswordStrength password={newPassword} />
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
