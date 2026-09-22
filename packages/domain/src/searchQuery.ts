import { type Axle, DomainError, type VehicleVariant } from "./types.ts";

export type SearchSort = "default" | "price_asc" | "price_desc";

export interface SearchInput {
  variant: VehicleVariant;
  q?: string;
  categorySlug?: string;
  brand?: string;
  axle?: Axle | null;
  sort: SearchSort;
  /** 1-based. */
  page: number;
}

export interface SearchBody {
  query: unknown;
  sort: unknown[];
  from: number;
  size: number;
  track_total_hits: true;
  _source: { excludes: ["fitments"] };
}

export const PAGE_SIZE = 24;
export const BOOSTS = { inStock: 3, oe: 2, premium: 1 } as const;

const FITMENT_INNER_HITS = 10;
const TEXT_FIELDS = ["name", "sku", "oe_ref", "brand"];

/**
 * Constrain, then rank. Fitment lives in filter context and never touches
 * the score; the `should` clauses only order the parts that survived.
 * Emits a plain object; nothing here talks to Elasticsearch.
 */
export function buildSearchQuery(input: SearchInput): SearchBody {
  if (!Number.isInteger(input.page) || input.page < 1) {
    throw new DomainError(`page: expected an integer of at least 1, got ${input.page}`);
  }

  const filter: unknown[] = [fitmentFilter(input.variant, input.axle ?? null)];
  if (input.categorySlug !== undefined)
    filter.push({ term: { category_path: input.categorySlug } });
  if (input.brand !== undefined) filter.push({ term: { brand: input.brand } });
  if (input.q !== undefined) filter.push({ multi_match: { query: input.q, fields: TEXT_FIELDS } });

  return {
    query: { bool: { filter, should: ranking() } },
    sort: sortFor(input.sort),
    from: (input.page - 1) * PAGE_SIZE,
    size: PAGE_SIZE,
    track_total_hits: true,
    _source: { excludes: ["fitments"] },
  };
}

/** A part passes when a nested fitment row matches the variant, or it is universal. */
function fitmentFilter(variant: VehicleVariant, axle: Axle | null): unknown {
  const rowFilter: unknown[] = [
    { term: { "fitments.variant_id": variant.id } },
    unlessSet("fitments.build_from", {
      range: { "fitments.build_from": { lte: variant.buildFrom } },
    }),
    unlessSet("fitments.build_to", { range: { "fitments.build_to": { gte: variant.buildFrom } } }),
  ];
  if (axle !== null) {
    rowFilter.push(unlessSet("fitments.axle", { term: { "fitments.axle": axle } }));
  }
  if (variant.equipment.length > 0) {
    rowFilter.push(
      unlessSet("fitments.equipment_code", {
        terms: { "fitments.equipment_code": variant.equipment },
      }),
    );
  }

  return {
    bool: {
      should: [
        {
          nested: {
            path: "fitments",
            query: { bool: { filter: rowFilter } },
            inner_hits: { size: FITMENT_INNER_HITS },
          },
        },
        { term: { universal: true } },
      ],
      minimum_should_match: 1,
    },
  };
}

/** An optional restriction: the field is absent on the row, or `match` holds. */
function unlessSet(field: string, match: unknown): unknown {
  return {
    bool: {
      should: [{ bool: { must_not: { exists: { field } } } }, match],
      minimum_should_match: 1,
    },
  };
}

function ranking(): unknown[] {
  return [
    { term: { in_stock: { value: true, boost: BOOSTS.inStock } } },
    { term: { brand_tier: { value: "oe", boost: BOOSTS.oe } } },
    { term: { brand_tier: { value: "premium", boost: BOOSTS.premium } } },
  ];
}

function sortFor(sort: SearchSort): unknown[] {
  switch (sort) {
    case "default":
      return ["_score", { price_cents: "asc" }];
    case "price_asc":
      return [{ price_cents: "asc" }];
    case "price_desc":
      return [{ price_cents: "desc" }];
  }
}
