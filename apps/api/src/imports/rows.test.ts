import { describe, expect, it } from "vitest";

import { checkReferences, parseChunk, referencedIds } from "./rows.js";

const row = (sku: string, overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    sku,
    brand: "Quorabrake",
    brandTier: "premium",
    categorySlug: "brakes/pads",
    name: `Quorabrake Pads ${sku}`,
    oeRef: "VEL-12345",
    attributes: {},
    priceCents: 4990,
    stockQty: 3,
    universal: false,
    fitments: [
      { variantId: "v_000001", buildFrom: null, buildTo: null, axle: null, equipmentCode: null },
    ],
    ...overrides,
  });

const known = { categories: new Set(["brakes/pads"]), variants: new Set(["v_000001"]) };

describe("parseChunk", () => {
  it("keeps valid rows with their file index and rejects bad JSON and bad shapes", () => {
    const parsed = parseChunk([row("A"), "{not json", row("B", { priceCents: -1 })], 2000);

    expect(parsed.valid.map((r) => [r.row, r.data.sku])).toEqual([[2000, "A"]]);
    expect(parsed.invalid).toEqual([
      { row: 2001, errors: ["row: not valid JSON"] },
      { row: 2002, errors: ["priceCents: expected an integer of at least 0"] },
    ]);
  });
});

describe("referencedIds", () => {
  it("lists each category and variant once", () => {
    const { valid } = parseChunk(
      [row("A"), row("B", { fitments: [] }), row("C", { categorySlug: "filters/oil" })],
      0,
    );

    expect(referencedIds(valid)).toEqual({
      categorySlugs: ["brakes/pads", "filters/oil"],
      variantIds: ["v_000001"],
    });
  });
});

describe("checkReferences", () => {
  it("rejects unknown categories and variants as row errors, in file order", () => {
    const parsed = parseChunk(
      [
        row("A", { categorySlug: "nope/none" }),
        "oops",
        row("B", {
          fitments: [
            {
              variantId: "v_nope",
              buildFrom: null,
              buildTo: null,
              axle: null,
              equipmentCode: null,
            },
          ],
        }),
        row("C"),
      ],
      10,
    );

    const prepared = checkReferences(parsed, known);

    expect(prepared.rows.map((r) => r.sku)).toEqual(["C"]);
    expect(prepared.accepted).toBe(1);
    expect(prepared.invalid).toEqual([
      { row: 10, errors: ['categorySlug: unknown category "nope/none"'] },
      { row: 11, errors: ["row: not valid JSON"] },
      { row: 12, errors: ['fitments[0].variantId: unknown variant "v_nope"'] },
    ]);
  });

  it("keeps the last row when a chunk repeats a SKU, but counts both as accepted", () => {
    const parsed = parseChunk([row("A", { priceCents: 100 }), row("A", { priceCents: 200 })], 0);

    const prepared = checkReferences(parsed, known);

    expect(prepared.rows).toHaveLength(1);
    expect(prepared.rows[0]?.priceCents).toBe(200);
    expect(prepared.accepted).toBe(2);
  });
});
