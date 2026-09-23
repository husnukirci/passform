"use client";

import { MakesResponse, ModelsResponse, VariantsResponse } from "@passform/contracts";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { apiFetch, errorMessage } from "@/lib/api";

interface Props {
  onChoose: (variantId: string) => void;
  disabled: boolean;
}

/** The fallback: make → model → variant. The half-finished choice is transient UI state, not the URL's. */
export function MakeModelPicker({ onChoose, disabled }: Props) {
  const ids = { make: useId(), model: useId(), variant: useId() };
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [variantId, setVariantId] = useState("");

  const makes = useQuery({
    queryKey: ["makes"],
    queryFn: () => apiFetch("/vehicles/makes", MakesResponse),
  });
  const models = useQuery({
    queryKey: ["models", make],
    queryFn: () => apiFetch(`/vehicles/models?${new URLSearchParams({ make })}`, ModelsResponse),
    enabled: make !== "",
  });
  const variants = useQuery({
    queryKey: ["variants", make, model],
    queryFn: () => apiFetch(`/vehicles?${new URLSearchParams({ make, model })}`, VariantsResponse),
    enabled: make !== "" && model !== "",
  });

  const error = makes.error ?? models.error ?? variants.error;
  const selectClass =
    "mt-1 rounded border border-border bg-background px-2 py-1 disabled:opacity-60";

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col" htmlFor={ids.make}>
        Make
        <select
          id={ids.make}
          value={make}
          onChange={(event) => {
            setMake(event.target.value);
            setModel("");
            setVariantId("");
          }}
          disabled={!makes.data}
          className={selectClass}
        >
          <option value="">{makes.data ? "Choose a make" : "Loading…"}</option>
          {makes.data?.makes.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col" htmlFor={ids.model}>
        Model
        <select
          id={ids.model}
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
            setVariantId("");
          }}
          disabled={make === "" || !models.data}
          className={selectClass}
        >
          <option value="">Choose a model</option>
          {models.data?.models.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col" htmlFor={ids.variant}>
        Variant
        <select
          id={ids.variant}
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
          disabled={model === "" || !variants.data}
          className={selectClass}
        >
          <option value="">Choose a variant</option>
          {variants.data?.variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled || variantId === ""}
        onClick={() => onChoose(variantId)}
        className="rounded bg-accent px-4 py-1.5 font-medium text-accent-fg disabled:opacity-60"
      >
        Use this vehicle
      </button>
      {error && (
        <p role="alert" className="basis-full text-fit-no">
          {errorMessage(error)}
        </p>
      )}
    </div>
  );
}
