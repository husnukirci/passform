import type { Fitment, Part, VehicleVariant } from "@passform/domain";
import { describe, expect, it } from "vitest";

import {
  type FitmentRow,
  fitmentToRow,
  type PartRow,
  partToRow,
  rowToFitment,
  rowToPart,
  rowToVariant,
  type VariantRow,
  variantToRow,
} from "./mappers.js";

const variantRow: VariantRow = {
  id: "v_000001",
  make: "Varenta",
  model: "Kestra",
  engineCode: "D16-77",
  kw: 77,
  fuel: "diesel",
  buildFrom: "2014-03",
  buildTo: "2019-08",
  equipment: ["BRK-L", "AC"],
  keyManufacturer: "0417",
  keyType: "A2K",
};

const variant: VehicleVariant = {
  id: "v_000001",
  make: "Varenta",
  model: "Kestra",
  engineCode: "D16-77",
  kw: 77,
  fuel: "diesel",
  buildFrom: "2014-03",
  buildTo: "2019-08",
  equipment: ["BRK-L", "AC"],
  key: { manufacturer: "0417", type: "A2K" },
};

const partRow: PartRow = {
  id: "p_0000001",
  sku: "AUT-000001",
  brand: "Auteko",
  brandTier: "oe",
  categoryId: "brakes/pads",
  name: "Auteko brake pad set",
  oeRef: "OE-4471",
  attributes: { axle: "front", widthMm: 131 },
  priceCents: 4990,
  stockQty: 12,
  supplierId: "s_01",
  universal: false,
};

const part: Part = {
  id: "p_0000001",
  sku: "AUT-000001",
  brand: "Auteko",
  brandTier: "oe",
  categorySlug: "brakes/pads",
  name: "Auteko brake pad set",
  oeRef: "OE-4471",
  attributes: { axle: "front", widthMm: 131 },
  priceCents: 4990,
  stockQty: 12,
  supplierId: "s_01",
  universal: false,
};

const fitmentRow: FitmentRow = {
  id: 7,
  partId: "p_0000001",
  variantId: "v_000001",
  buildFrom: "2015-01",
  buildTo: null,
  axle: "front",
  equipmentCode: null,
};

const fitment: Fitment = {
  variantId: "v_000001",
  buildFrom: "2015-01",
  buildTo: null,
  axle: "front",
  equipmentCode: null,
};

describe("variant mappers", () => {
  it("maps a row to the domain shape and back", () => {
    expect(rowToVariant(variantRow)).toEqual(variant);
    expect(variantToRow(variant)).toEqual(variantRow);
  });

  it("copies the equipment array instead of sharing it", () => {
    const mapped = rowToVariant(variantRow);
    mapped.equipment.push("TOW");
    expect(variantRow.equipment).toEqual(["BRK-L", "AC"]);
  });
});

describe("part mappers", () => {
  it("maps a row to the domain shape and back", () => {
    expect(rowToPart(partRow)).toEqual(part);
    expect(partToRow(part)).toEqual(partRow);
  });

  it("renames category_id to categorySlug", () => {
    expect(rowToPart(partRow).categorySlug).toBe("brakes/pads");
    expect(partToRow(part).categoryId).toBe("brakes/pads");
  });
});

describe("fitment mappers", () => {
  it("drops the row identity and the owning part on the way to the domain", () => {
    expect(rowToFitment(fitmentRow)).toEqual(fitment);
  });

  it("attaches the owning part on the way to a row", () => {
    const { id: _id, ...insert } = fitmentRow;
    expect(fitmentToRow("p_0000001", fitment)).toEqual(insert);
  });

  it("round-trips through both directions", () => {
    expect(rowToFitment({ id: 1, ...fitmentToRow("p_0000001", fitment) })).toEqual(fitment);
  });
});
