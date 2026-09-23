import { describe, expect, it } from "vitest";

import { availableStock } from "./stock.ts";
import { DomainError } from "./types.ts";

describe("availableStock", () => {
  it("subtracts the units open reservations will give back from what the supplier reports", () => {
    expect(availableStock(5, 2)).toBe(3);
  });

  it("is zero when open reservations exceed the reported stock", () => {
    expect(availableStock(1, 4)).toBe(0);
  });

  it("stores the reported stock as-is when nothing is reserved", () => {
    expect(availableStock(7, 0)).toBe(7);
  });

  it("rejects a negative reported stock", () => {
    expect(() => availableStock(-1, 0)).toThrow(
      new DomainError("reported: expected an integer of at least 0, got -1"),
    );
  });

  it("rejects a fractional reported stock", () => {
    expect(() => availableStock(2.5, 0)).toThrow(DomainError);
  });

  it("rejects negative open reserved units", () => {
    expect(() => availableStock(5, -2)).toThrow(
      new DomainError("openReservedUnits: expected an integer of at least 0, got -2"),
    );
  });

  it("rejects fractional open reserved units", () => {
    expect(() => availableStock(5, 0.5)).toThrow(DomainError);
  });
});
