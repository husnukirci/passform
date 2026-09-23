import { z } from "zod";

import { Axle, BrandTier, FitDto, YearMonth } from "./common.ts";

/** The domain `Part`, as stored in Postgres. */
export const PartDto = z.object({
  id: z.string(),
  sku: z.string(),
  brand: z.string(),
  brandTier: BrandTier,
  categorySlug: z.string(),
  name: z.string(),
  oeRef: z.string(),
  attributes: z.record(z.string(), z.union([z.string(), z.number()])),
  priceCents: z.number().int(),
  stockQty: z.number().int(),
  supplierId: z.string(),
  universal: z.boolean(),
});
export type PartDto = z.infer<typeof PartDto>;

/** The domain `Fitment`: one row linking the part to a variant, with restrictions. */
export const FitmentDto = z.object({
  variantId: z.string(),
  buildFrom: YearMonth.nullable(),
  buildTo: YearMonth.nullable(),
  axle: Axle.nullable(),
  equipmentCode: z.string().nullable(),
});
export type FitmentDto = z.infer<typeof FitmentDto>;

export const PartDetailQuery = z.object({ variantId: z.string().min(1).optional() });
export type PartDetailQuery = z.infer<typeof PartDetailQuery>;

export const PartDetailResponse = PartDto.extend({
  /** Every ancestor slug plus the leaf, root first. */
  categoryPath: z.array(z.string()),
  /** Null when no `variantId` was given. */
  fit: FitDto.nullable(),
  fitments: z.array(FitmentDto),
});
export type PartDetailResponse = z.infer<typeof PartDetailResponse>;
