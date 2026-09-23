import { describe, expect, it } from "vitest";

import { DomainError, type VehicleVariant } from "./types.ts";
import { parseRegistrationKey, resolveVariants, variantLabel } from "./vehicleKey.ts";

const KEY = { manufacturer: "0588", type: "AKX" };
const OTHER_KEY = { manufacturer: "0588", type: "AKY" };

function variant(overrides: Partial<VehicleVariant>): VehicleVariant {
  return {
    id: "v_000001",
    make: "Aldervane",
    model: "Corvin",
    engineCode: "AV14D",
    kw: 85,
    fuel: "diesel",
    buildFrom: "2012-08",
    buildTo: "2018-06",
    equipment: [],
    key: KEY,
    ...overrides,
  };
}

describe("parseRegistrationKey", () => {
  it("trims and uppercases both fields", () => {
    expect(parseRegistrationKey({ manufacturer: " 0588 ", type: " akx\t" })).toEqual({
      manufacturer: "0588",
      type: "AKX",
    });
  });

  it("accepts digits in the type", () => {
    expect(parseRegistrationKey({ manufacturer: "1234", type: "a1b" }).type).toBe("A1B");
  });

  it("rejects a five-digit manufacturer, naming the field", () => {
    expect(() => parseRegistrationKey({ manufacturer: "12345", type: "AKX" })).toThrow(
      new DomainError("manufacturer: expected exactly 4 digits"),
    );
  });

  it("rejects a manufacturer with letters", () => {
    expect(() => parseRegistrationKey({ manufacturer: "05A8", type: "AKX" })).toThrow(DomainError);
  });

  it("rejects a type of the wrong length, naming the field", () => {
    expect(() => parseRegistrationKey({ manufacturer: "0588", type: "AK" })).toThrow(
      new DomainError("type: expected exactly 3 characters A-Z or 0-9"),
    );
  });

  it("rejects a type with punctuation", () => {
    expect(() => parseRegistrationKey({ manufacturer: "0588", type: "A-X" })).toThrow(DomainError);
  });
});

describe("resolveVariants", () => {
  it("returns no variants and no disambiguation for zero matches", () => {
    const candidates = [variant({ key: OTHER_KEY })];

    expect(resolveVariants(KEY, candidates)).toEqual({ variants: [], needsDisambiguation: false });
  });

  it("returns the single match without disambiguation", () => {
    const match = variant({ id: "v_000002" });
    const candidates = [variant({ id: "v_000001", key: OTHER_KEY }), match];

    expect(resolveVariants(KEY, candidates)).toEqual({
      variants: [match],
      needsDisambiguation: false,
    });
  });

  it("asks for disambiguation when several candidates match", () => {
    const candidates = [variant({ id: "v_000001" }), variant({ id: "v_000002", kw: 110 })];

    expect(resolveVariants(KEY, candidates).needsDisambiguation).toBe(true);
  });

  it("sorts matches by buildFrom, then kw", () => {
    const candidates = [
      variant({ id: "late-strong", buildFrom: "2015-01", kw: 110 }),
      variant({ id: "early-strong", buildFrom: "2012-08", kw: 110 }),
      variant({ id: "late-weak", buildFrom: "2015-01", kw: 85 }),
      variant({ id: "early-weak", buildFrom: "2012-08", kw: 85 }),
    ];

    const ids = resolveVariants(KEY, candidates).variants.map((v) => v.id);

    expect(ids).toEqual(["early-weak", "early-strong", "late-weak", "late-strong"]);
  });

  it("does not reorder the candidates it was given", () => {
    const candidates = [
      variant({ id: "late", buildFrom: "2015-01" }),
      variant({ id: "early", buildFrom: "2012-08" }),
    ];

    resolveVariants(KEY, candidates);

    expect(candidates.map((v) => v.id)).toEqual(["late", "early"]);
  });
});

describe("variantLabel", () => {
  it("formats engine, power, fuel and build window", () => {
    expect(variantLabel(variant({}))).toBe("AV14D · 85 kW · diesel · 2012-08 → 2018-06");
  });

  it("prints 'today' for an open build window", () => {
    expect(variantLabel(variant({ buildTo: null }))).toBe(
      "AV14D · 85 kW · diesel · 2012-08 → today",
    );
  });
});
