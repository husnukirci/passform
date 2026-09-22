import { describe, expect, it } from "vitest";

import { evaluateFit } from "./fit.js";
import type { Fitment, VehicleVariant } from "./types.js";

/** Freeze fixtures all the way down so any mutation throws under ESM strict mode. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const VARIANT: VehicleVariant = deepFreeze({
  id: "v_000001",
  make: "Aldervane",
  model: "Corvin",
  engineCode: "AV14D",
  kw: 85,
  fuel: "diesel",
  buildFrom: "2012-08",
  buildTo: "2018-06",
  equipment: ["SPORT_SUSP"],
  key: { manufacturer: "0588", type: "AKX" },
});

const UNKNOWN_EQUIPMENT: VehicleVariant = deepFreeze({ ...VARIANT, equipment: [] });
const OPEN_ENDED: VehicleVariant = deepFreeze({ ...VARIANT, buildTo: null });

const PART = deepFreeze({ sku: "BRK-0001", universal: false });
const UNIVERSAL = deepFreeze({ sku: "OIL-0001", universal: true });

function row(overrides: Partial<Fitment> = {}): Fitment {
  return deepFreeze({
    variantId: VARIANT.id,
    buildFrom: null,
    buildTo: null,
    axle: null,
    equipmentCode: null,
    ...overrides,
  });
}

describe("evaluateFit: universal parts", () => {
  it("fits every vehicle and ignores fitment rows", () => {
    const contradicting = [row({ variantId: "v_999999" })];

    expect(evaluateFit(VARIANT, UNIVERSAL, contradicting, null)).toEqual({
      result: "fits",
      reason: "Universal part, fits every vehicle",
    });
  });
});

describe("evaluateFit: fits", () => {
  it("names the vehicle and its build window", () => {
    expect(evaluateFit(VARIANT, PART, [row()], null)).toEqual({
      result: "fits",
      reason: "Fits Aldervane Corvin AV14D (2012-08 → 2018-06)",
    });
  });

  it("prints 'today' for an open build window", () => {
    expect(evaluateFit(OPEN_ENDED, PART, [row()], null).reason).toBe(
      "Fits Aldervane Corvin AV14D (2012-08 → today)",
    );
  });

  it("fits when the build date lies inside the row's window", () => {
    const windowed = row({ buildFrom: "2012-08", buildTo: "2014-12" });

    expect(evaluateFit(VARIANT, PART, [windowed], null).result).toBe("fits");
  });

  it("appends the axle when the winning row has one and it was chosen", () => {
    expect(evaluateFit(VARIANT, PART, [row({ axle: "front" })], "front").reason).toBe(
      "Fits Aldervane Corvin AV14D (2012-08 → 2018-06) on the front axle",
    );
  });

  it("shows both axles when no axle was chosen", () => {
    expect(evaluateFit(VARIANT, PART, [row({ axle: "rear" })], null)).toEqual({
      result: "fits",
      reason: "Fits Aldervane Corvin AV14D (2012-08 → 2018-06) on the rear axle",
    });
  });

  it("fits when the required equipment is on the vehicle", () => {
    expect(evaluateFit(VARIANT, PART, [row({ equipmentCode: "SPORT_SUSP" })], null).result).toBe(
      "fits",
    );
  });
});

describe("evaluateFit: ask", () => {
  it("asks when the row needs equipment and the vehicle's equipment is unknown", () => {
    expect(
      evaluateFit(UNKNOWN_EQUIPMENT, PART, [row({ equipmentCode: "SPORT_SUSP" })], null),
    ).toEqual({
      result: "ask",
      reason: "Fits if the vehicle has equipment SPORT_SUSP; confirm before ordering",
      equipmentCode: "SPORT_SUSP",
    });
  });
});

describe("evaluateFit: no", () => {
  it("reports a build window the vehicle falls outside of", () => {
    const later = row({ buildFrom: "2015-01", buildTo: "2019-12" });

    expect(evaluateFit(VARIANT, PART, [later], null)).toEqual({
      result: "no",
      reason: "Not for vehicles built 2012-08; this part covers 2015-01 → 2019-12",
    });
  });

  it("prints 'any' for an open side of the row's window", () => {
    expect(evaluateFit(VARIANT, PART, [row({ buildFrom: "2015-01" })], null).reason).toBe(
      "Not for vehicles built 2012-08; this part covers 2015-01 → any",
    );
    expect(evaluateFit(VARIANT, PART, [row({ buildTo: "2010-12" })], null).reason).toBe(
      "Not for vehicles built 2012-08; this part covers any → 2010-12",
    );
  });

  it("reports equipment the vehicle is known not to have", () => {
    expect(evaluateFit(VARIANT, PART, [row({ equipmentCode: "TOW_HITCH" })], null)).toEqual({
      result: "no",
      reason: "Requires equipment TOW_HITCH, which this vehicle does not have",
    });
  });

  it("reports no fitment when no row is for the variant", () => {
    expect(evaluateFit(VARIANT, PART, [row({ variantId: "v_000002" })], null)).toEqual({
      result: "no",
      reason: "No fitment for this vehicle",
    });
  });

  it("reports no fitment when there are no rows at all", () => {
    expect(evaluateFit(VARIANT, PART, [], null).reason).toBe("No fitment for this vehicle");
  });

  it("reports an axle mismatch when only the chosen axle differs", () => {
    expect(evaluateFit(VARIANT, PART, [row({ axle: "front" })], "rear")).toEqual({
      result: "no",
      reason: "Only for the front axle",
    });
  });
});

describe("evaluateFit: several rows", () => {
  it("fits beats ask", () => {
    const rows = [row({ equipmentCode: "SPORT_SUSP" }), row()];

    expect(evaluateFit(UNKNOWN_EQUIPMENT, PART, rows, null).result).toBe("fits");
  });

  it("ask beats no", () => {
    const rows = [row({ variantId: "v_000002" }), row({ equipmentCode: "SPORT_SUSP" })];

    expect(evaluateFit(UNKNOWN_EQUIPMENT, PART, rows, null)).toMatchObject({
      result: "ask",
      equipmentCode: "SPORT_SUSP",
    });
  });

  it("reports the reason of the row that got furthest: window beats variant", () => {
    const rows = [row({ buildFrom: "2015-01" }), row({ variantId: "v_000002" })];

    expect(evaluateFit(VARIANT, PART, rows, null).reason).toBe(
      "Not for vehicles built 2012-08; this part covers 2015-01 → any",
    );
  });

  it("reports the reason of the row that got furthest: axle beats window", () => {
    const rows = [row({ axle: "front" }), row({ buildFrom: "2015-01" })];

    expect(evaluateFit(VARIANT, PART, rows, "rear").reason).toBe("Only for the front axle");
  });

  it("reports the reason of the row that got furthest: equipment beats axle", () => {
    const rows = [row({ axle: "front" }), row({ equipmentCode: "TOW_HITCH" })];

    expect(evaluateFit(VARIANT, PART, rows, "rear").reason).toBe(
      "Requires equipment TOW_HITCH, which this vehicle does not have",
    );
  });

  it("reports the first fitting row's axle", () => {
    const rows = [row({ axle: "rear" }), row({ axle: "front" })];

    expect(evaluateFit(VARIANT, PART, rows, null).reason).toBe(
      "Fits Aldervane Corvin AV14D (2012-08 → 2018-06) on the rear axle",
    );
  });
});
