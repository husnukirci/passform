import { describe, expect, it } from "vitest";

import { CHUNK_SIZE, chunkRanges, validateImportRow } from "./importRows.js";
import { DomainError } from "./types.js";

const VALID = {
  sku: "BRK-0001",
  brand: "Ferrostat",
  brandTier: "premium",
  categorySlug: "brakes/discs",
  name: "Brake disc, vented, 280 mm",
  oeRef: "VT-33-2810",
  attributes: { diameterMm: 280, position: "front" },
  priceCents: 4599,
  stockQty: 12,
  universal: false,
  fitments: [
    {
      variantId: "v_000001",
      buildFrom: "2012-08",
      buildTo: null,
      axle: "front",
      equipmentCode: null,
    },
  ],
};

function errorsOf(raw: unknown): string[] {
  const validation = validateImportRow(raw);
  return validation.ok ? [] : validation.errors;
}

describe("validateImportRow", () => {
  it("round-trips a valid row", () => {
    expect(validateImportRow(VALID)).toEqual({ ok: true, row: VALID });
  });

  it("accepts a universal row with no fitments", () => {
    expect(validateImportRow({ ...VALID, universal: true, fitments: [] }).ok).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(errorsOf("BRK-0001")).toEqual(["row: expected an object"]);
    expect(errorsOf(null)).toEqual(["row: expected an object"]);
  });

  it.each([
    [{ sku: "" }, "sku: expected a non-empty string"],
    [{ sku: 12 }, "sku: expected a non-empty string"],
    [{ brand: "" }, "brand: expected a non-empty string"],
    [{ brandTier: "budget" }, "brandTier: expected one of oe, premium, standard"],
    [{ categorySlug: "" }, "categorySlug: expected a non-empty string"],
    [{ name: "" }, "name: expected a non-empty string"],
    [{ oeRef: 7 }, "oeRef: expected a string"],
    [{ attributes: null }, "attributes: expected an object of string or number values"],
    [{ attributes: { ok: true } }, "attributes: expected an object of string or number values"],
    [{ priceCents: 45.99 }, "priceCents: expected an integer of at least 0"],
    [{ priceCents: -1 }, "priceCents: expected an integer of at least 0"],
    [{ stockQty: -1 }, "stockQty: expected an integer of at least 0"],
    [{ universal: "no" }, "universal: expected a boolean"],
    [{ fitments: "none" }, "fitments: expected an array"],
  ])("rejects %j with %s", (override, error) => {
    expect(errorsOf({ ...VALID, ...override })).toEqual([error]);
  });

  it("names a missing field", () => {
    const { sku: _dropped, ...withoutSku } = VALID;

    expect(errorsOf(withoutSku)).toEqual(["sku: expected a non-empty string"]);
  });

  it("rejects a universal row that carries fitments", () => {
    expect(errorsOf({ ...VALID, universal: true })).toEqual([
      "fitments: expected none for a universal row",
    ]);
  });

  it.each([
    [{ variantId: "" }, "fitments[0].variantId: expected a non-empty string"],
    [{ buildFrom: "2012-13" }, "fitments[0].buildFrom: expected YYYY-MM or null"],
    [{ buildTo: "2020" }, "fitments[0].buildTo: expected YYYY-MM or null"],
    [{ axle: "left" }, "fitments[0].axle: expected front, rear or null"],
    [{ equipmentCode: 3 }, "fitments[0].equipmentCode: expected a string or null"],
  ])("rejects fitment %j with %s", (override, error) => {
    const fitments = [{ ...VALID.fitments[0], ...override }];

    expect(errorsOf({ ...VALID, fitments })).toEqual([error]);
  });

  it("rejects a fitment that is not an object, by index", () => {
    expect(errorsOf({ ...VALID, fitments: [VALID.fitments[0], "v_000001"] })).toEqual([
      "fitments[1]: expected an object",
    ]);
  });

  it("collects every error instead of stopping at the first", () => {
    const broken = {
      ...VALID,
      sku: "",
      priceCents: -1,
      fitments: [{ ...VALID.fitments[0], axle: "up" }],
    };

    expect(errorsOf(broken)).toEqual([
      "sku: expected a non-empty string",
      "priceCents: expected an integer of at least 0",
      "fitments[0].axle: expected front, rear or null",
    ]);
  });

  it("returns a fresh row rather than the raw input", () => {
    const validation = validateImportRow(VALID);

    expect(validation.ok && validation.row).not.toBe(VALID);
  });
});

describe("chunkRanges", () => {
  it("splits 2500 rows into three ranges with the default size", () => {
    expect(CHUNK_SIZE).toBe(1000);
    expect(chunkRanges(2500)).toEqual([
      { seq: 0, rowFrom: 0, rowTo: 1000 },
      { seq: 1, rowFrom: 1000, rowTo: 2000 },
      { seq: 2, rowFrom: 2000, rowTo: 2500 },
    ]);
  });

  it("returns no ranges for zero rows", () => {
    expect(chunkRanges(0)).toEqual([]);
  });

  it("makes exactly one range when the total equals the chunk size", () => {
    expect(chunkRanges(5, 5)).toEqual([{ seq: 0, rowFrom: 0, rowTo: 5 }]);
  });

  it("rejects a chunk size below 1", () => {
    expect(() => chunkRanges(10, 0)).toThrow(DomainError);
  });

  it("rejects a negative or fractional row count", () => {
    expect(() => chunkRanges(-1)).toThrow(DomainError);
    expect(() => chunkRanges(2.5)).toThrow(DomainError);
  });

  it("honours a custom chunk size", () => {
    expect(chunkRanges(7, 3)).toEqual([
      { seq: 0, rowFrom: 0, rowTo: 3 },
      { seq: 1, rowFrom: 3, rowTo: 6 },
      { seq: 2, rowFrom: 6, rowTo: 7 },
    ]);
  });
});
