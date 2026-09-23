import { PartDetailResponse } from "@passform/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartButton } from "@/components/parts/AddToCartButton";
import { FitBadge } from "@/components/parts/FitBadge";
import { ApiError, apiFetch } from "@/lib/api";
import { formatEur, formatWindow } from "@/lib/format";
import { decodeSearchParams, type RawSearchParams } from "@/lib/searchParams";
import { cookieVariantId } from "@/lib/vehicle.server";

interface Props {
  params: Promise<{ sku: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).sku };
}

export default async function PartPage({ params, searchParams }: Props) {
  const { sku } = await params;
  const variantId = decodeSearchParams(await searchParams).variantId ?? (await cookieVariantId());
  const part = await loadPart(sku, variantId);
  if (part === null) notFound();

  const backHref = variantId ? `/parts?variant=${encodeURIComponent(variantId)}` : "/parts";

  return (
    <article className="space-y-6">
      <Link href={backHref} className="text-sm text-link underline">
        ← Back to results
      </Link>

      <header>
        <p className="text-sm text-muted">
          {part.brand} · {part.brandTier} · <span className="font-mono">{part.sku}</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{part.name}</h1>
        <p className="mt-1 text-sm text-muted">{part.categoryPath.join(" › ")}</p>
      </header>

      <section aria-labelledby="fit-heading" className="rounded-lg border border-border p-4">
        <h2 id="fit-heading" className="text-base font-semibold">
          Fit for your vehicle
        </h2>
        <div className="mt-2 text-sm">
          {part.fit ? (
            <FitBadge fit={part.fit} />
          ) : (
            <p>
              No vehicle selected.{" "}
              <Link href="/" className="text-link underline">
                Choose one
              </Link>{" "}
              to check the fit.
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-2xl font-semibold">{formatEur(part.priceCents)}</p>
          <p className={`text-sm ${part.stockQty > 0 ? "text-muted" : "text-fit-no"}`}>
            {part.stockQty > 0 ? `${part.stockQty} in stock` : "Out of stock"} · supplier{" "}
            {part.supplierId}
          </p>
        </div>
        <AddToCartButton
          part={{
            id: part.id,
            sku: part.sku,
            name: part.name,
            priceCents: part.priceCents,
            stockQty: part.stockQty,
          }}
        />
      </section>

      <section aria-labelledby="attributes-heading">
        <h2 id="attributes-heading" className="text-base font-semibold">
          Attributes
        </h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">OE reference</dt>
          <dd className="font-mono">{part.oeRef}</dd>
          {Object.entries(part.attributes).map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-muted">{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="fitments-heading">
        <h2 id="fitments-heading" className="text-base font-semibold">
          Fitment rows
        </h2>
        {part.universal ? (
          <p className="mt-2 text-sm text-muted">Universal part: fits every vehicle, no rows.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Variant
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Build window
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Axle
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Equipment
                  </th>
                </tr>
              </thead>
              <tbody>
                {part.fitments.map((row, index) => (
                  <tr
                    key={`${row.variantId}-${index}`}
                    className={`border-b border-border ${row.variantId === variantId ? "font-medium" : ""}`}
                  >
                    <td className="py-1 pr-4 font-mono">{row.variantId}</td>
                    <td className="py-1 pr-4">{formatWindow(row.buildFrom, row.buildTo)}</td>
                    <td className="py-1 pr-4">{row.axle ?? "any"}</td>
                    <td className="py-1 font-mono">{row.equipmentCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </article>
  );
}

async function loadPart(sku: string, variantId: string | null): Promise<PartDetailResponse | null> {
  const query = variantId ? `?variantId=${encodeURIComponent(variantId)}` : "";
  try {
    return await apiFetch(`/parts/${encodeURIComponent(sku)}${query}`, PartDetailResponse);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
