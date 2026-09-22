// The `parts` index mapping and settings. `buildSearchQuery` in the domain
// is written against these field names; change one, change both. Fitments
// are nested so a query matches one row's variant and window together
// (ADR 5). Build dates are `yyyy-MM` strings, as everywhere else.

import type { estypes } from "@elastic/elasticsearch";

const YEAR_MONTH: estypes.MappingProperty = { type: "date", format: "yyyy-MM" };

export const PARTS_MAPPING: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    sku: { type: "keyword" },
    name: { type: "text", fields: { keyword: { type: "keyword" } } },
    brand: { type: "keyword" },
    brand_tier: { type: "keyword" },
    /** Every ancestor slug plus the leaf, so a category filter matches its subtree. */
    category_path: { type: "keyword" },
    oe_ref: { type: "keyword" },
    attributes: {
      type: "object",
      dynamic: true,
      properties: { axle: { type: "keyword" } },
    },
    price_cents: { type: "integer" },
    in_stock: { type: "boolean" },
    universal: { type: "boolean" },
    fitments: {
      type: "nested",
      properties: {
        variant_id: { type: "keyword" },
        build_from: YEAR_MONTH,
        build_to: YEAR_MONTH,
        axle: { type: "keyword" },
        equipment_code: { type: "keyword" },
      },
    },
  },
};

/** Settings at creation: no refreshes while the bulk load runs. */
export const PARTS_SETTINGS_FOR_LOAD: estypes.IndicesIndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  refresh_interval: "-1",
};

/** Restored once the load is verified, before the alias moves. */
export const PARTS_SETTINGS_FOR_SERVING: estypes.IndicesIndexSettings = {
  refresh_interval: "1s",
};
