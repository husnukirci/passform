"use client";

import { VehicleVariantDto } from "@passform/contracts";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { apiFetch } from "@/lib/api";

interface Props {
  /** The `pf_variant` cookie, read by the layout; the URL wins when it names a vehicle. */
  cookieVariantId: string | null;
}

/** The current vehicle, on every page, with a way to change it. */
export function VehicleBar({ cookieVariantId }: Props) {
  const params = useSearchParams();
  const variantId = params.get("variant") ?? cookieVariantId;

  const vehicle = useQuery({
    queryKey: ["vehicle", variantId],
    queryFn: () => apiFetch(`/vehicles/${encodeURIComponent(variantId ?? "")}`, VehicleVariantDto),
    enabled: variantId !== null,
  });

  return (
    <div className="border-b border-border bg-surface text-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span className="text-muted">Vehicle:</span>
        {variantId === null ? (
          <>
            <span>none selected</span>
            <Link href="/" className="text-link underline">
              choose a vehicle
            </Link>
          </>
        ) : vehicle.data ? (
          <>
            <span className="font-medium">
              {vehicle.data.make} {vehicle.data.model}
            </span>
            <span className="text-muted">{vehicle.data.label}</span>
            <Link href="/" className="text-link underline">
              change
            </Link>
          </>
        ) : vehicle.isError ? (
          <>
            <span>unknown vehicle {variantId}</span>
            <Link href="/" className="text-link underline">
              choose another
            </Link>
          </>
        ) : (
          <span className="text-muted" aria-busy="true">
            loading {variantId}…
          </span>
        )}
      </div>
    </div>
  );
}
