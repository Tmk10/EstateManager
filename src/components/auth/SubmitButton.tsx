import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { BUTTON_PRIMARY_BLOCK } from "@/lib/ui";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pendingText, icon, children }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  // A plain <button> rather than ui/button.tsx's <Button>: that component's `default` variant
  // already paints itself from the same primary token, so wrapping it only to override its
  // classes produced two sources for one button. The shared string is the source now.
  return (
    <button type="submit" disabled={pending} className={BUTTON_PRIMARY_BLOCK}>
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2"
          />
          {pendingText}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
