import { describe, expect, it } from "vitest";

import { DEFAULT_SEARCH_STATE, decodeSearchParams, encodeSearchParams } from "./searchParams";

describe("searchParams codec", () => {
  it("round-trips a fully specified state", () => {
    const state = {
      variantId: "v_000003",
      q: "pads",
      category: "brakes/pads",
      brand: "Rembrix",
      axle: "front" as const,
      sort: "price_asc" as const,
      page: 3,
    };

    expect(decodeSearchParams(encodeSearchParams(state))).toEqual(state);
  });

  it("falls back to defaults on junk without throwing", () => {
    const params = new URLSearchParams({
      variant: "",
      axle: "left",
      sort: "cheapest",
      page: "-4",
      q: "   ",
    });

    expect(decodeSearchParams(params)).toEqual({
      ...DEFAULT_SEARCH_STATE,
      variantId: null,
    });
  });

  it("treats a non-integer page as page 1", () => {
    expect(decodeSearchParams(new URLSearchParams({ page: "2.5" })).page).toBe(1);
    expect(decodeSearchParams(new URLSearchParams({ page: "abc" })).page).toBe(1);
  });

  it("elides defaults and empty filters when encoding", () => {
    const params = encodeSearchParams({
      ...DEFAULT_SEARCH_STATE,
      variantId: "v_000001",
      q: "",
      sort: "default",
      page: 1,
    });

    expect(params.toString()).toBe("variant=v_000001");
  });

  it("decodes Next's searchParams object shape as well as URLSearchParams", () => {
    const state = decodeSearchParams({ variant: "v_000009", axle: ["rear", "front"], page: "2" });

    expect(state.variantId).toBe("v_000009");
    expect(state.axle).toBe("rear");
    expect(state.page).toBe(2);
  });
});
