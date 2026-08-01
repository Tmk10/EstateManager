import React, { useState } from "react";
import { Building2, MapPin, Signpost, Plus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

type Field = "name" | "city" | "street";

// Mirrors the server-side bound in src/pages/api/buildings/index.ts. Client-side
// validation is a courtesy; the endpoint re-checks everything because a form post can
// arrive without ever running this component.
const MAX_LENGTH = 200;

const LABELS: Record<Field, string> = {
  name: "Nazwa budynku",
  city: "Miejscowość",
  street: "Ulica i numer",
};

export default function BuildingForm({ serverError }: Props) {
  const [values, setValues] = useState<Record<Field, string>>({ name: "", city: "", street: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function validate() {
    const next: Partial<Record<Field, string>> = {};
    for (const field of Object.keys(LABELS) as Field[]) {
      const value = values[field].trim();
      if (!value) {
        next[field] = "To pole jest wymagane";
      } else if (value.length > MAX_LENGTH) {
        next[field] = `Maksymalnie ${String(MAX_LENGTH)} znaków`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function update(field: Field, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/buildings" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label={LABELS.name}
        value={values.name}
        onChange={(v) => {
          update("name", v);
        }}
        placeholder="Wspólnota Mieszkaniowa Kwiatowa 3"
        error={errors.name}
        icon={<Building2 className="size-4" />}
      />

      <FormField
        id="city"
        label={LABELS.city}
        value={values.city}
        onChange={(v) => {
          update("city", v);
        }}
        placeholder="Warszawa"
        error={errors.city}
        icon={<MapPin className="size-4" />}
      />

      <FormField
        id="street"
        label={LABELS.street}
        value={values.street}
        onChange={(v) => {
          update("street", v);
        }}
        placeholder="Kwiatowa 3"
        error={errors.street}
        icon={<Signpost className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie..." icon={<Plus className="size-4" />}>
        Dodaj budynek
      </SubmitButton>
    </form>
  );
}
