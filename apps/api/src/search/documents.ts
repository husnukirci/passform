// Domain part <-> index document. The only place domain field names meet
// index field names; the builder and the search service both go through
// this so the mapping in mapping.ts and the document shape cannot drift
// unnoticed.

import type { SearchHitDto } from "@passform/contracts";
import type { Axle, BrandTier, Fitment, Part, YearMonth } from "@passform/domain";

export interface FitmentDocument {
  variant_id: string;
  build_from: YearMonth | null;
  build_to: YearMonth | null;
  axle: Axle | null;
  equipment_code: string | null;
}

/** One document per part; `_id` is the part id and is not repeated in the body. */
export interface PartDocument {
  sku: string;
  name: string;
  brand: string;
  brand_tier: BrandTier;
  /** Every ancestor slug plus the leaf. */
  category_path: string[];
  oe_ref: string;
  attributes: Record<string, string | number>;
  price_cents: number;
  in_stock: boolean;
  universal: boolean;
  /** Empty for a universal part. */
  fitments: FitmentDocument[];
}

export function partToDocument(
  part: Part,
  categoryPath: string[],
  fitments: Fitment[],
): PartDocument {
  return {
    sku: part.sku,
    name: part.name,
    brand: part.brand,
    brand_tier: part.brandTier,
    category_path: [...categoryPath],
    oe_ref: part.oeRef,
    attributes: { ...part.attributes },
    price_cents: part.priceCents,
    in_stock: part.stockQty > 0,
    universal: part.universal,
    fitments: fitments.map((fitment) => ({
      variant_id: fitment.variantId,
      build_from: fitment.buildFrom,
      build_to: fitment.buildTo,
      axle: fitment.axle,
      equipment_code: fitment.equipmentCode,
    })),
  };
}

/** A nested `inner_hits` row back into the domain shape, for `evaluateFit`. */
export function documentToFitment(document: FitmentDocument): Fitment {
  return {
    variantId: document.variant_id,
    buildFrom: document.build_from,
    buildTo: document.build_to,
    axle: document.axle,
    equipmentCode: document.equipment_code,
  };
}

/** The part fields a search hit carries; `_source` excludes the fitments. */
export type HitSource = Omit<PartDocument, "fitments">;

export function documentToHit(id: string, source: HitSource): Omit<SearchHitDto, "fit"> {
  const categorySlug = source.category_path.at(-1);
  if (categorySlug === undefined) throw new Error(`part ${id}: empty category_path in the index`);
  return {
    id,
    sku: source.sku,
    name: source.name,
    brand: source.brand,
    brandTier: source.brand_tier,
    categorySlug,
    oeRef: source.oe_ref,
    attributes: { ...source.attributes },
    priceCents: source.price_cents,
    inStock: source.in_stock,
    universal: source.universal,
  };
}
