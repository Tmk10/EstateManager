import { CircleAlert } from "lucide-react";
import { ALERT_ERROR } from "@/lib/ui";
import { cn } from "@/lib/utils";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className={cn(ALERT_ERROR, "flex items-center gap-2")} role="alert">
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
