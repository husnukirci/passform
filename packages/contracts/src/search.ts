import { z } from "zod";

import { Axle, FitDto } from "./common.ts";
import { PartDto } from "./parts.ts";

export const SearchSort = z.enum(["default", "price_asc", "price_desc"]);
export type SearchSort = z.infer<typeof SearchSort>;

/** Query-string input: everything arrives as a string, so `page` is coerced. */
export const SearchQuery = z.object({
  variantId: z.string().min(1),
  q: z.string().min(1).optional(),
  /** A category slug; matches the category and its subtree. */
  category: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  axle: Axle.optional(),
  sort: SearchSort.default("default"),
  page: z.coerce.number().int().min(1).default(1),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

/**
 * A hit comes from the index, which carries whether a part is in stock but
 * not the quantity or supplier; those are on the part detail.
 */
export const SearchHitDto = PartDto.omit({ stockQty: true, supplierId: true }).extend({
  inStock: z.boolean(),
  fit: FitDto,
});
export type SearchHitDto = z.infer<typeof SearchHitDto>;

export const SearchResponse = z.object({
  hits: z.array(SearchHitDto),
  /** `fitted`: parts that passed the fitment filter; `shown`: this page. */
  stages: z.object({ fitted: z.number().int().min(0), shown: z.number().int().min(0) }),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type SearchResponse = z.infer<typeof SearchResponse>;
