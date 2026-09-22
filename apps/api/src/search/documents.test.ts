import type { Fitment, Part } from "@passform/domain";
import { describe, expect, it } from "vitest";

import { partToDocument } from "./documents.js";

const part: Part = {
  id: "p_0000001",
  sku: "TOR-000001",
  brand: "Torbenna",
  brandTier: "oe",
  categorySlug: "brakes/pads",
  name: "Torbenna brake pad set",
  oeRef: "OE-4471",
  attributes: { axle: "front", widthMm: 131 },
  priceCents: 4990,
  stockQty: 12,
  supplierId: "s_01",
  universal: false,
};

const fitments: Fitment[] = [
  {
    variantId: "v_000001",
    buildFrom: "2012-08",
    buildTo: null,
    axle: "front",
    equipmentCode: null,
  },
  {
    variantId: "v_000002",
    buildFrom: null,
    buildTo: "2015-03",
    axle: null,
    equipmentCode: "BRK-L",
  },
];

describe("partToDocument", () => {
  it("mirrors the mapping field for field, with the category path as given", () => {
    expect(partToDocument(part, ["brakes", "brakes/pads"], fitments)).toEqual({
      sku: "TOR-000001",
      name: "Torbenna brake pad set",
      brand: "Torbenna",
      brand_tier: "oe",
      category_path: ["brakes", "brakes/pads"],
      oe_ref: "OE-4471",
      attributes: { axle: "front", widthMm: 131 },
      price_cents: 4990,
      in_stock: true,
      universal: false,
      fitments: [
        {
          variant_id: "v_000001",
          build_from: "2012-08",
          build_to: null,
          axle: "front",
          equipment_code: null,
        },
        {
          variant_id: "v_000002",
          build_from: null,
          build_to: "2015-03",
          axle: null,
          equipment_code: "BRK-L",
        },
      ],
    });
  });

  it("marks a part out of stock when its quantity is zero", () => {
    const document = partToDocument({ ...part, stockQty: 0 }, ["brakes", "brakes/pads"], fitments);

    expect(document.in_stock).toBe(false);
  });

  it("gives a universal part an empty fitments array", () => {
    const document = partToDocument({ ...part, universal: true }, ["fluids", "fluids/grease"], []);

    expect(document.universal).toBe(true);
    expect(document.fitments).toEqual([]);
  });
});
