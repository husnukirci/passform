"use client";

import { ResolveVehicleResponse, type VehicleVariantDto } from "@passform/contracts";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useId } from "react";

import { apiFetch, errorMessage } from "@/lib/api";

import { MakeModelPicker } from "./MakeModelPicker";
import { useChooseVehicle } from "./useChooseVehicle";

/** The registration-key form; one match routes straight on, several ask the visitor. */
export function VehiclePicker() {
  const ids = { manufacturer: useId(), type: useId(), results: useId() };
  const { choose, pending } = useChooseVehicle();

  const resolve = useMutation({
    mutationFn: (key: { manufacturer: string; type: string }) => {
      const query = new URLSearchParams(key);
      return apiFetch(`/vehicles/resolve?${query}`, ResolveVehicleResponse);
    },
    onSuccess: (data) => {
      const only = data.variants[0];
      if (only !== undefined && data.variants.length === 1) choose(only.id);
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    resolve.mutate({
      manufacturer: String(form.get("manufacturer") ?? ""),
      type: String(form.get("type") ?? ""),
    });
  };

  const busy = resolve.isPending || pending;
  const variants = resolve.data?.variants ?? [];

  return (
    <div className="space-y-8">
      <form
        onSubmit={onSubmit}
        className="rounded-lg border border-border bg-surface p-4"
        aria-describedby={ids.results}
      >
        <h2 className="text-base font-semibold">Registration key</h2>
        <p className="mt-1 text-sm text-muted">
          The two-part key from the registration document: four digits, then three characters.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm" htmlFor={ids.manufacturer}>
            Manufacturer key
            <input
              id={ids.manufacturer}
              name="manufacturer"
              inputMode="numeric"
              autoComplete="off"
              placeholder="1103"
              maxLength={4}
              required
              className="mt-1 w-28 rounded border border-border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col text-sm" htmlFor={ids.type}>
            Type key
            <input
              id={ids.type}
              name="type"
              autoComplete="off"
              placeholder="003"
              maxLength={3}
              required
              className="mt-1 w-24 rounded border border-border bg-background px-2 py-1 font-mono uppercase"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {busy ? "Looking up…" : "Find vehicle"}
          </button>
        </div>

        <div id={ids.results} className="mt-4 text-sm" aria-live="polite">
          {resolve.isError && (
            <p role="alert" className="text-fit-no">
              {errorMessage(resolve.error)}
            </p>
          )}
          {resolve.isSuccess && variants.length === 0 && (
            <p>No vehicle for this key. Pick it by make and model below instead.</p>
          )}
          {resolve.isSuccess && variants.length === 1 && <p>One match, opening its parts…</p>}
        </div>
      </form>

      {resolve.isSuccess && variants.length > 1 && (
        <DisambiguationCard variants={variants} onChoose={choose} disabled={busy} />
      )}

      <section aria-labelledby="by-make" className="rounded-lg border border-border p-4">
        <h2 id="by-make" className="text-base font-semibold">
          Or pick by make and model
        </h2>
        <MakeModelPicker onChoose={choose} disabled={busy} />
      </section>
    </div>
  );
}

interface CardProps {
  variants: VehicleVariantDto[];
  onChoose: (variantId: string) => void;
  disabled: boolean;
}

/** Several variants share one key. The API never guesses; the visitor picks. */
function DisambiguationCard({ variants, onChoose, disabled }: CardProps) {
  const first = variants[0];
  const key = first ? `${first.key.manufacturer}/${first.key.type}` : "";
  return (
    <section
      aria-labelledby="disambiguate"
      className="rounded-lg border-2 border-fit-ask bg-surface p-4"
    >
      <h2 id="disambiguate" className="text-base font-semibold">
        {variants.length} vehicles share key {key}. Which is yours?
      </h2>
      <p className="mt-1 text-sm text-muted">
        Engine, power, fuel and build window tell them apart.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {variants.map((variant) => (
          <li key={variant.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(variant.id)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-left text-sm hover:border-accent disabled:opacity-60"
            >
              <span className="block font-medium">
                {variant.make} {variant.model}
              </span>
              <span className="block font-mono text-xs text-muted">{variant.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
