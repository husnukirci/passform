import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  isIdempotencyKey,
  lineTotalCents,
  orderTotalCents,
  RESERVATION_TTL_MINUTES,
  reservationExpiresAt,
} from "./orders.js";
import { DomainError } from "./types.js";

describe("lineTotalCents", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotalCents({ partId: "p_0000001", qty: 3, unitCents: 1999 })).toBe(5997);
  });

  it("rejects a quantity below 1", () => {
    expect(() => lineTotalCents({ partId: "p_0000001", qty: 0, unitCents: 1999 })).toThrow(
      new DomainError("qty: expected an integer of at least 1, got 0"),
    );
  });

  it("rejects a fractional quantity", () => {
    expect(() => lineTotalCents({ partId: "p_0000001", qty: 1.5, unitCents: 1999 })).toThrow(
      DomainError,
    );
  });

  it("rejects non-integer cents", () => {
    expect(() => lineTotalCents({ partId: "p_0000001", qty: 1, unitCents: 19.99 })).toThrow(
      new DomainError("unitCents: expected an integer of at least 0, got 19.99"),
    );
  });

  it("rejects negative cents", () => {
    expect(() => lineTotalCents({ partId: "p_0000001", qty: 1, unitCents: -1 })).toThrow(
      DomainError,
    );
  });
});

describe("orderTotalCents", () => {
  it("sums hand-computed line totals without rounding", () => {
    const lines = [
      { partId: "p_0000001", qty: 3, unitCents: 1999 }, // 5997
      { partId: "p_0000002", qty: 1, unitCents: 12345 }, // 12345
      { partId: "p_0000003", qty: 10, unitCents: 1 }, // 10
    ];

    expect(orderTotalCents(lines)).toBe(18352);
  });

  it("rejects an empty order", () => {
    expect(() => orderTotalCents([])).toThrow(new DomainError("lines: expected at least one line"));
  });

  it("rejects an order with an invalid line", () => {
    const lines = [
      { partId: "p_0000001", qty: 1, unitCents: 100 },
      { partId: "p_0000002", qty: 0, unitCents: 100 },
    ];

    expect(() => orderTotalCents(lines)).toThrow(DomainError);
  });
});

describe("canonicalJson", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("sorts keys recursively and emits no whitespace", () => {
    const value = { z: { y: 1, x: [{ n: 2, m: 3 }] }, a: "s" };

    expect(canonicalJson(value)).toBe('{"a":"s","z":{"x":[{"m":3,"n":2}],"y":1}}');
  });

  it("drops undefined properties", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("serialises primitives and null like JSON", () => {
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
  });
});

describe("isIdempotencyKey", () => {
  it.each([
    "123e4567-e89b-12d3-a456-426614174000",
    "123E4567-E89B-42D3-A456-426614174000",
    "00000000-0000-0000-0000-000000000000",
    "9b2b0c1e-7f1a-7b3c-9d4e-0f1a2b3c4d5e",
  ])("accepts %s", (key) => {
    expect(isIdempotencyKey(key)).toBe(true);
  });

  it.each([
    "",
    "order-1",
    "123e4567e89b12d3a456426614174000",
    "123e4567-e89b-12d3-a456-42661417400",
    "123e4567-e89b-12d3-a456-4266141740000",
    "g23e4567-e89b-12d3-a456-426614174000",
    " 123e4567-e89b-12d3-a456-426614174000",
  ])("rejects %j", (key) => {
    expect(isIdempotencyKey(key)).toBe(false);
  });
});

describe("reservationExpiresAt", () => {
  it("is exactly the TTL after placement", () => {
    const placedAt = new Date("2026-09-22T10:00:00.000Z");

    expect(RESERVATION_TTL_MINUTES).toBe(15);
    expect(reservationExpiresAt(placedAt).toISOString()).toBe("2026-09-22T10:15:00.000Z");
  });

  it("does not mutate the placement time", () => {
    const placedAt = new Date("2026-09-22T10:00:00.000Z");

    reservationExpiresAt(placedAt);

    expect(placedAt.toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });
});
