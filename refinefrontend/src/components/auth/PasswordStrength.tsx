/** Four-segment strength hint under the new-password field. Advisory only: ERPNext enforces the real policy on save. */
export const MIN_PASSWORD_LENGTH = 8;

function score(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < MIN_PASSWORD_LENGTH) return 1;
  if (classes < 3) return 2;
  return pw.length >= 12 ? 4 : 3;
}

const LEVELS = {
  1: { label: "Too short", bar: "bg-destructive", text: "text-destructive" },
  2: { label: "Fair", bar: "bg-warning", text: "text-warning" },
  3: { label: "Good", bar: "bg-success", text: "text-success" },
  4: { label: "Strong", bar: "bg-success", text: "text-success" },
} as const;

export function PasswordStrength({ password }: { password: string }) {
  const s = score(password);
  if (s === 0) return null;
  const level = LEVELS[s];
  return (
    <div className="-mt-2 flex flex-col gap-2" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-sm ${i <= s ? level.bar : "bg-border"}`} />
        ))}
      </div>
      <span className={`text-[13px] font-semibold ${level.text}`}>
        {level.label} · at least {MIN_PASSWORD_LENGTH} characters
      </span>
    </div>
  );
}
