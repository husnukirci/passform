import { describe, expect, it } from "vitest";

import { StockUpdateBody, StockUpdateResponse } from "./stock.ts";

describe("StockUpdateBody", () => {
  it("accepts rows carrying a price, a stock, or both", () => {
    const body = {
      rows: [
        { sku: "QB-1001", priceCents: 4990 },
        { sku: "QB-1002", stockQty: 0 },
        { sku: "QB-1003", priceCents: 1250, stockQty: 12 },
      ],
    };

    expect(StockUpdateBody.parse(body)).toEqual(body);
  });

  it("rejects an empty rows array", () => {
    expect(StockUpdateBody.safeParse({ rows: [] }).success).toBe(false);
  });

  it("rejects more than 1,000 rows", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ sku: `QB-${i}`, stockQty: 1 }));

    expect(StockUpdateBody.safeParse({ rows }).success).toBe(false);
  });

  it("rejects a repeated sku", () => {
    const result = StockUpdateBody.safeParse({
      rows: [
        { sku: "QB-1001", priceCents: 1 },
        { sku: "QB-1001", stockQty: 2 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("sku must be unique across rows");
  });

  it("rejects a row with neither priceCents nor stockQty", () => {
    const result = StockUpdateBody.safeParse({ rows: [{ sku: "QB-1001" }] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("expected priceCents or stockQty");
  });

  it("rejects a negative or fractional price and stock, and an empty sku", () => {
    expect(StockUpdateBody.safeParse({ rows: [{ sku: "QB-1", priceCents: -1 }] }).success).toBe(
      false,
    );
    expect(StockUpdateBody.safeParse({ rows: [{ sku: "QB-1", priceCents: 19.99 }] }).success).toBe(
      false,
    );
    expect(StockUpdateBody.safeParse({ rows: [{ sku: "QB-1", stockQty: -1 }] }).success).toBe(
      false,
    );
    expect(StockUpdateBody.safeParse({ rows: [{ sku: "QB-1", stockQty: 1.5 }] }).success).toBe(
      false,
    );
    expect(StockUpdateBody.safeParse({ rows: [{ sku: "", stockQty: 1 }] }).success).toBe(false);
  });
});

describe("StockUpdateResponse", () => {
  it("carries the applied count, the unknown skus and whether the index took the change", () => {
    const response = { updated: 2, unknown: ["QB-9"], indexed: false };

    expect(StockUpdateResponse.parse(response)).toEqual(response);
  });
});
