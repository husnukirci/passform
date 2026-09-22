import { describe, expect, it } from "vitest";

import { SearchQuery } from "./search.ts";

describe("SearchQuery", () => {
  it("coerces page from the query string and defaults sort and page", () => {
    expect(SearchQuery.parse({ variantId: "v_000001" })).toEqual({
      variantId: "v_000001",
      sort: "default",
      page: 1,
    });
    expect(SearchQuery.parse({ variantId: "v_000001", page: "3", sort: "price_asc" })).toEqual({
      variantId: "v_000001",
      sort: "price_asc",
      page: 3,
    });
  });

  it("rejects a missing variant, a page below 1 and an unknown sort", () => {
    expect(SearchQuery.safeParse({}).success).toBe(false);
    expect(SearchQuery.safeParse({ variantId: "v_000001", page: "0" }).success).toBe(false);
    expect(SearchQuery.safeParse({ variantId: "v_000001", page: "1.5" }).success).toBe(false);
    expect(SearchQuery.safeParse({ variantId: "v_000001", sort: "name" }).success).toBe(false);
  });
});
