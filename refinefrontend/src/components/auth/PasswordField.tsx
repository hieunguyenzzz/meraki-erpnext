import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> {
  id: string;
  label: string;
  /** Extra node shown at the right of the label row (e.g. "Forgot?"). */
  labelAside?: React.ReactNode;
}

/** Password input with a show/hide toggle. */
export function PasswordField({ id, label, labelAside, className, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <Input id={id} type={shown ? "text" : "password"} className={`h-12 pr-12 text-base lg:h-[52px] ${className ?? ""}`} {...rest} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute right-0 top-0 flex h-12 w-12 lg:h-[52px] items-center justify-center rounded-input text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
