import type { SearchHitDto } from "@passform/contracts";
import Link from "next/link";

import { formatEur } from "@/lib/format";

import { FitBadge } from "./FitBadge";

interface Props {
  hits: SearchHitDto[];
  variantId: string;
}

export function ResultsList({ hits, variantId }: Props) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {hits.map((hit) => (
        <li key={hit.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">
              {hit.brand} · {hit.brandTier} · {hit.sku}
            </p>
            <Link
              href={`/parts/${encodeURIComponent(hit.sku)}?variant=${encodeURIComponent(variantId)}`}
              className="font-medium hover:underline"
            >
              {hit.name}
            </Link>
            <div className="mt-1">
              <FitBadge fit={hit.fit} />
            </div>
          </div>
          <div className="text-right text-sm sm:w-32">
            <p className="font-semibold">{formatEur(hit.priceCents)}</p>
            <p className={hit.inStock ? "text-muted" : "text-fit-no"}>
              {hit.inStock ? "In stock" : "Out of stock"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
