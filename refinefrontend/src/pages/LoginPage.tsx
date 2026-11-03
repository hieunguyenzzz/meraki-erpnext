import { useEffect, useRef, useState } from "react";
import { useLogin, useIsAuthenticated } from "@refinedev/core";
import { Navigate } from "react-router";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthIcon } from "@/components/auth/AuthIcon";
import { PasswordField } from "@/components/auth/PasswordField";

type View = "login" | "forgot" | "forgot-success";

const linkBtn =
  "inline-flex h-11 max-md:h-12 items-center justify-center text-[15px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md";
const primaryBtn = "h-12 w-full text-base md:h-[54px]";

export default function LoginPage() {
  const { data: authData, isLoading } = useIsAuthenticated();
  const { mutate: login } = useLogin();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const [view, setView] = useState<View>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(false);
  const resetRef = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(cooldownTimer.current), []);

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6" role="status" aria-label="Loading">
        <Skeleton className="h-64 w-full max-w-[400px]" />
      </div>
    );
  }

  if (authData?.authenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setSubmitting(true);
    login(
      { username, password },
      {
        onSuccess: (data) => {
          if (!data.success) {
            setError(data.error?.message || "Invalid username or password");
          }
          submittingRef.current = false;
          setSubmitting(false);
        },
        onError: (err) => {
          console.error("[login] request failed", err);
          setError("Something went wrong. Please try again.");
          submittingRef.current = false;
          setSubmitting(false);
        },
      }
    );
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetRef.current || resetCooldown) return;
    resetRef.current = true;
    setResetError("");
    setResetSubmitting(true);
    try {
      const body = new URLSearchParams({ user: resetEmail });
      const res = await fetch(
        "/api/method/frappe.core.doctype.user.user.reset_password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Frappe-Site-Name": "erp.merakiwp.com",
          },
          body: body.toString(),
        }
      );
      if (res.ok) {
        setView("forgot-success");
      } else if (res.status === 404) {
        setResetError("No account found with that email address.");
      } else if (res.status === 429) {
        console.error("[reset-password] rate limited (429)");
        setResetError("Too many attempts, try again in a few minutes.");
        setResetCooldown(true);
        cooldownTimer.current = setTimeout(() => setResetCooldown(false), 60000);
      } else {
        const data = await res.json().catch((err) => {
          console.error("[reset-password] unreadable error body", res.status, err);
          return null;
        });
        console.error("[reset-password] failed", res.status);
        setResetError(
          data?.message || "Failed to send reset email. Please try again."
        );
      }
    } catch (err) {
      console.error("[reset-password] request failed", err);
      setResetError("Something went wrong. Please try again.");
    } finally {
      resetRef.current = false;
      setResetSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setView("login");
    setResetEmail("");
    setResetError("");
  };

  return (
    <AuthShell>
      {view === "login" && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label="Sign in">
          <h1 className="font-display text-[34px] font-semibold leading-none max-lg:sr-only lg:mb-1.5">Sign in</h1>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username" className="text-sm font-semibold">Email or username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-12 text-base"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus={isDesktop}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>
          <PasswordField
            id="password"
            name="password"
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
            labelAside={
              <button
                type="button"
                className="-my-2 inline-flex h-11 items-center max-md:h-12 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setView("forgot");
                  setResetEmail(username.includes("@") ? username : "");
                }}
              >
                Forgot password?
              </button>
            }
          />
          {error && <AuthAlert id="login-error">{error}</AuthAlert>}
          <Button type="submit" className={primaryBtn} disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      )}

      {view === "forgot" && (
        <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4" aria-label="Reset password">
          <h1 className="text-[22px] font-semibold">Reset your password</h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground">
            Enter your email and we'll send you a link to choose a new one.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-email" className="text-sm font-semibold">Email</Label>
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="h-12 text-base"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
              autoFocus={isDesktop}
              placeholder="you@example.com"
              aria-invalid={!!resetError}
              aria-describedby={resetError ? "reset-error" : undefined}
            />
          </div>
          {resetError && <AuthAlert id="reset-error">{resetError}</AuthAlert>}
          <Button type="submit" className={primaryBtn} disabled={resetSubmitting || resetCooldown}>
            {resetSubmitting ? "Sending..." : "Send reset link"}
          </Button>
          <button type="button" className={linkBtn} onClick={handleBackToLogin}>
            Back to sign in
          </button>
        </form>
      )}

      {view === "forgot-success" && (
        <div role="status" className="flex flex-col items-center gap-3.5 text-center">
          <AuthIcon>
            <Mail className="h-9 w-9" strokeWidth={1.75} />
          </AuthIcon>
          <h1 className="text-[22px] font-semibold">Check your email</h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground">
            Reset instructions have been sent to{" "}
            <span className="font-medium text-foreground">{resetEmail}</span>. Didn't get it? Check your spam folder.
          </p>
          <button type="button" className={linkBtn} onClick={handleBackToLogin}>
            Back to sign in
          </button>
        </div>
      )}
    </AuthShell>
  );
}
