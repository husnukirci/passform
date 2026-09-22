// Parts for the unit tests. Names are invented compounds.

import type { Fitment, Part } from "@passform/domain";

export function part(overrides: Partial<Part> = {}): Part {
  return {
    id: "p_0000001",
    sku: "QRB-0000001",
    brand: "Quorabrake",
    brandTier: "premium",
    categorySlug: "brakes/pads",
    name: "Quorabrake Pads K240",
    oeRef: "VEL-12345",
    attributes: { axle: "front" },
    priceCents: 4990,
    stockQty: 12,
    supplierId: "s_01",
    universal: false,
    ...overrides,
  };
}

export function fitment(overrides: Partial<Fitment> = {}): Fitment {
  return {
    variantId: "v_000001",
    buildFrom: null,
    buildTo: null,
    axle: null,
    equipmentCode: null,
    ...overrides,
  };
}
