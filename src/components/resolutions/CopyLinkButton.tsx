import { useEffect, useState } from "react";
import { Check, Copy, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
}

type Status = "idle" | "copied" | "failed";

const REVERT_AFTER_MS = 2000;

/**
 * Copies one voting link to the clipboard -- the only interactive element in S-02, and
 * therefore the only .tsx.
 *
 * The URL is rendered as selectable text beside the button on purpose. Handing the link
 * over by hand is the product path in S-02 (nothing is e-mailed until S-04), so it must not
 * depend on navigator.clipboard, which is absent on an insecure origin and refused by some
 * browsers without a user gesture. The button is the convenience; the text is the feature.
 */
export default function CopyLinkButton({ url }: Props) {
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (status === "idle") return;

    const timer = setTimeout(() => {
      setStatus("idle");
    }, REVERT_AFTER_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // No message carries the URL: the token in it is a bearer secret, and the failure
      // has one answer anyway -- copy the text that is already on screen.
      setStatus("failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 text-xs break-all text-blue-100/70">{url}</code>

      <button
        type="button"
        onClick={() => {
          void copy();
        }}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
          status === "copied"
            ? "border-green-400/50 bg-green-500/10 text-green-200"
            : status === "failed"
              ? "border-red-400/50 bg-red-500/10 text-red-200"
              : "border-white/20 bg-white/5 text-blue-100/80 hover:border-purple-400/50 hover:bg-white/10",
        )}
      >
        {status === "copied" ? (
          <>
            <Check className="size-3.5" />
            Skopiowano
          </>
        ) : status === "failed" ? (
          <>
            <CircleAlert className="size-3.5" />
            Skopiuj ręcznie
          </>
        ) : (
          <>
            <Copy className="size-3.5" />
            Kopiuj
          </>
        )}
      </button>
    </div>
  );
}
