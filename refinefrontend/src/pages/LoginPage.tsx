import { useState } from "react";
import { useLogin, useIsAuthenticated } from "@refinedev/core";
import { Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeSwitch } from "@/components/theme-switch";

type View = "login" | "forgot" | "forgot-success";

export default function LoginPage() {
  const { data: authData, isLoading } = useIsAuthenticated();
  const { mutate: login } = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [view, setView] = useState<View>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (authData?.authenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    login(
      { username, password },
      {
        onSuccess: (data) => {
          if (!data.success) {
            setError(data.error?.message || "Invalid username or password");
          }
          setSubmitting(false);
        },
        onError: () => {
          setError("Something went wrong. Please try again.");
          setSubmitting(false);
        },
      }
    );
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      } else {
        const data = await res.json().catch(() => null);
        setResetError(
          data?.message || "Failed to send reset email. Please try again."
        );
      }
    } catch {
      setResetError("Something went wrong. Please try again.");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setView("login");
    setResetEmail("");
    setResetError("");
  };

  return (
    <div className="relative flex h-screen items-center justify-center bg-muted/40">
      <div className="absolute top-4 right-4">
        <ThemeSwitch />
      </div>
      <Card className="w-full max-w-sm">
        {view === "login" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Meraki Wedding Planner</CardTitle>
              <CardDescription>Sign in to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Email or Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                      onClick={() => {
                        setView("forgot");
                        setResetEmail(username.includes("@") ? username : "");
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {view === "forgot" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Reset Password</CardTitle>
              <CardDescription>
                Enter your email and we'll send you reset instructions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@example.com"
                  />
                </div>
                {resetError && (
                  <p className="text-sm text-destructive">{resetError}</p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetSubmitting}
                >
                  {resetSubmitting ? "Sending..." : "Send Reset Email"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  onClick={handleBackToLogin}
                >
                  &larr; Back to login
                </button>
              </form>
            </CardContent>
          </>
        )}

        {view === "forgot-success" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription>
                Password reset instructions have been sent to{" "}
                <span className="font-medium text-foreground">{resetEmail}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={handleBackToLogin}
              >
                &larr; Back to login
              </button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
