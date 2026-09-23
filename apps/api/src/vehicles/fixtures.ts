// Variants for the unit tests. Names are invented compounds.

import type { VehicleVariant } from "@passform/domain";

export function variant(overrides: Partial<VehicleVariant> = {}): VehicleVariant {
  return {
    id: "v_000001",
    make: "Veltrano",
    model: "Corvex",
    engineCode: "D16-85",
    kw: 85,
    fuel: "diesel",
    buildFrom: "2012-03",
    buildTo: "2018-06",
    equipment: ["EQ-SPORT"],
    key: { manufacturer: "1103", type: "001" },
    ...overrides,
  };
}
