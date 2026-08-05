import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { INPUT, INPUT_INVALID, LABEL, FIELD_ERROR } from "@/lib/ui";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        {/* aria-hidden: the icon repeats the label, and a screen reader announcing "koperta
            Adres e-mail" is noise rather than help. */}
        <span aria-hidden="true" className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
          {icon}
        </span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          // The error is announced with the field rather than only drawn beside it: a red
          // border is invisible to a screen reader and to anyone who cannot separate the two
          // reds, which is roughly one man in twelve.
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(error ? INPUT_INVALID : INPUT, "pl-10", endContent && "pr-10")}
        />
        {endContent}
      </div>
      {error ? (
        <p id={errorId} className={FIELD_ERROR}>
          <CircleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
