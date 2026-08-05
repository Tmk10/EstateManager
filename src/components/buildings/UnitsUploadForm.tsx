import React, { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { LABEL, FIELD_ERROR } from "@/lib/ui";

interface Props {
  serverError?: string | null;
}

/**
 * The file control for the units import.
 *
 * Genuinely new UI rather than a reuse: FormField is built around value/onChange for text
 * and cannot carry a file. The native input is hidden behind a styled label because a raw
 * <input type="file"> cannot be restyled consistently across browsers, and because the
 * chosen file name needs somewhere legible to appear -- the native control truncates it.
 */
export default function UnitsUploadForm({ serverError }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!fileName) {
      e.preventDefault();
      setError("Wybierz plik CSV z listą lokali.");
    }
  }

  return (
    // No action: the form posts back to the page it is on, which handles POST itself.
    <form method="POST" encType="multipart/form-data" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-2">
        <label htmlFor="file" className={LABEL}>
          Plik CSV z listą lokali
        </label>

        <label
          htmlFor="file"
          className="border-input bg-muted/40 hover:border-ring hover:bg-accent flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors"
        >
          {fileName ? (
            <>
              <FileSpreadsheet aria-hidden="true" className="text-primary size-6" />
              <span className="text-foreground text-sm font-medium break-all">{fileName}</span>
              <span className="text-muted-foreground text-xs">Kliknij, żeby wybrać inny plik</span>
            </>
          ) : (
            <>
              <Upload aria-hidden="true" className="text-muted-foreground size-6" />
              <span className="text-foreground text-sm">Kliknij, żeby wybrać plik</span>
              <span className="text-muted-foreground text-xs">Format CSV, kodowanie UTF-8</span>
            </>
          )}
        </label>

        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            setFileName(selected ? selected.name : null);
            setError(null);
          }}
        />

        {error && (
          <p className={FIELD_ERROR} role="alert">
            {error}
          </p>
        )}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Wczytywanie..." icon={<Upload className="size-4" />}>
        Wczytaj plik
      </SubmitButton>
    </form>
  );
}
