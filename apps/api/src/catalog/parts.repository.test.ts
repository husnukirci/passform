import { describe, expect, it } from "vitest";

import { nextPartValues } from "./parts.repository.js";

const current = { priceCents: 4990, stockQty: 8 };

describe("nextPartValues", () => {
  it("takes the reported price and the reservation-adjusted stock when both are sent", () => {
    expect(nextPartValues({ sku: "QB-1", priceCents: 5290, stockQty: 5 }, current, 2)).toEqual({
      priceCents: 5290,
      stockQty: 3,
    });
  });

  it("keeps the current stock when only a price is sent, whatever is reserved", () => {
    expect(nextPartValues({ sku: "QB-1", priceCents: 5290 }, current, 2)).toEqual({
      priceCents: 5290,
      stockQty: 8,
    });
  });

  it("keeps the current price when only a stock is sent", () => {
    expect(nextPartValues({ sku: "QB-1", stockQty: 5 }, current, 0)).toEqual({
      priceCents: 4990,
      stockQty: 5,
    });
  });
});
