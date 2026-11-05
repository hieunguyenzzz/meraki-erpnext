import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ jobName }: { jobName: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleCopy() {
    const url = window.location.origin + "/apply?job=" + encodeURIComponent(jobName);
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch (err) {
      console.error("Copy application link failed", err);
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Button variant="ghost" onClick={() => void handleCopy()} className="max-md:h-12 md:h-9 md:px-3">
      {state === "copied" ? (
        <><Check className="text-success" aria-hidden />Copied</>
      ) : state === "failed" ? (
        <>Copy failed</>
      ) : (
        <><Copy aria-hidden />Link</>
      )}
    </Button>
  );
}
