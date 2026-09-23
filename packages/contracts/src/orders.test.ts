import { describe, expect, it } from "vitest";

import { CreateOrderBody, OrderErrorResponse, OrderResponse } from "./orders.ts";

describe("CreateOrderBody", () => {
  it("accepts distinct lines with positive integer quantities", () => {
    const body = {
      lines: [
        { partId: "p_0000001", qty: 2 },
        { partId: "p_0000002", qty: 1 },
      ],
    };

    expect(CreateOrderBody.parse(body)).toEqual(body);
  });

  it("rejects no lines, a zero or fractional qty, and a repeated partId", () => {
    expect(CreateOrderBody.safeParse({ lines: [] }).success).toBe(false);
    expect(CreateOrderBody.safeParse({ lines: [{ partId: "p_1", qty: 0 }] }).success).toBe(false);
    expect(CreateOrderBody.safeParse({ lines: [{ partId: "p_1", qty: 1.5 }] }).success).toBe(false);
    const repeated = CreateOrderBody.safeParse({
      lines: [
        { partId: "p_1", qty: 1 },
        { partId: "p_1", qty: 2 },
      ],
    });
    expect(repeated.success).toBe(false);
    expect(repeated.error?.issues[0]?.message).toBe("partId must be unique across lines");
  });
});

describe("OrderResponse", () => {
  it("accepts a placed order with ISO timestamps and a null confirmedAt", () => {
    const order = {
      id: "ord_1",
      status: "placed",
      totalCents: 9980,
      lines: [{ partId: "p_0000001", sku: "QB-1001", name: "Pads", qty: 2, unitCents: 4990 }],
      expiresAt: "2026-09-23T08:15:00.000Z",
      confirmedAt: null,
    };

    expect(OrderResponse.parse(order)).toEqual(order);
  });

  it("rejects an unknown status", () => {
    expect(OrderResponse.safeParse({ id: "ord_1", status: "paid" }).success).toBe(false);
  });
});

describe("OrderErrorResponse", () => {
  it("is an ErrorResponse that may name a sku", () => {
    expect(OrderErrorResponse.parse({ statusCode: 409, message: "x", sku: "QB-1" })).toEqual({
      statusCode: 409,
      message: "x",
      sku: "QB-1",
    });
    expect(OrderErrorResponse.parse({ statusCode: 404, message: "x" })).toEqual({
      statusCode: 404,
      message: "x",
    });
  });
});
