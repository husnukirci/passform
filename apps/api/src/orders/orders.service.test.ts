import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { OrderResponse } from "@passform/contracts";
import { describe, expect, it, vi } from "vitest";

import { type CreateOrderOutcome, OrdersRepository, type PartPrice } from "./orders.repository.js";
import { OrdersService, payloadHash } from "./orders.service.js";

const KEY = "3f0a9d0e-5b8c-4c1d-9a2e-7f6b5c4d3e2f";
const PRICES: PartPrice[] = [
  { id: "p_0000001", sku: "QB-1001", priceCents: 4990 },
  { id: "p_0000002", sku: "QB-1002", priceCents: 1250 },
];
const ORDER: OrderResponse = {
  id: "ord_1",
  status: "placed",
  totalCents: 11230,
  lines: [
    { partId: "p_0000001", sku: "QB-1001", name: "Pads", qty: 2, unitCents: 4990 },
    { partId: "p_0000002", sku: "QB-1002", name: "Clip", qty: 1, unitCents: 1250 },
  ],
  expiresAt: "2026-09-23T08:15:00.000Z",
  confirmedAt: null,
};
const BODY = {
  lines: [
    { partId: "p_0000001", qty: 2 },
    { partId: "p_0000002", qty: 1 },
  ],
};

type Repository = Pick<OrdersRepository, "partPrices" | "createOrder" | "find" | "confirm">;

function stubs(outcome: CreateOrderOutcome = { kind: "created", order: ORDER }) {
  const repository = {
    partPrices: vi.fn(async (ids: string[]) => PRICES.filter((part) => ids.includes(part.id))),
    createOrder: vi.fn(async () => outcome),
    find: vi.fn(async (id: string) => (id === ORDER.id ? ORDER : null)),
    confirm: vi.fn(async () => true),
  } satisfies Repository;
  return repository;
}

async function serviceWith(repository: Repository): Promise<OrdersService> {
  const moduleRef = await Test.createTestingModule({
    providers: [OrdersService, { provide: OrdersRepository, useValue: repository }],
  }).compile();
  return moduleRef.get(OrdersService);
}

describe("OrdersService.create", () => {
  it("prices the lines, hashes the canonical body and answers 201 for a created order", async () => {
    const repository = stubs();
    const service = await serviceWith(repository);

    const result = await service.create(KEY, BODY);

    expect(result).toEqual({ statusCode: 201, order: ORDER });
    expect(repository.createOrder).toHaveBeenCalledWith({
      key: KEY,
      payloadHash: payloadHash(BODY),
      lines: [
        { partId: "p_0000001", qty: 2, unitCents: 4990 },
        { partId: "p_0000002", qty: 1, unitCents: 1250 },
      ],
    });
  });

  it("answers 200 with the stored body for a replay", async () => {
    const service = await serviceWith(stubs({ kind: "replayed", response: ORDER }));

    expect(await service.create(KEY, BODY)).toEqual({ statusCode: 200, order: ORDER });
  });

  it("answers 409 for a key reused with a different payload", async () => {
    const service = await serviceWith(stubs({ kind: "conflict" }));

    await expect(service.create(KEY, BODY)).rejects.toMatchObject({
      status: 409,
      message: "Idempotency-Key reused with a different payload",
    });
  });

  it("answers 409 naming the sku when stock runs out", async () => {
    const service = await serviceWith(stubs({ kind: "out_of_stock", sku: "QB-1001" }));

    const error = await service.create(KEY, BODY).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message: "Insufficient stock for QB-1001",
      sku: "QB-1001",
    });
  });

  it("answers 400 without a key or with one that is not a UUID, before touching the database", async () => {
    const repository = stubs();
    const service = await serviceWith(repository);

    await expect(service.create(undefined, BODY)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create("order-1", BODY)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.partPrices).not.toHaveBeenCalled();
  });

  it("answers 404 for a line whose part does not exist", async () => {
    const repository = stubs();
    const service = await serviceWith(repository);

    await expect(
      service.create(KEY, { lines: [{ partId: "p_nope", qty: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.createOrder).not.toHaveBeenCalled();
  });
});

describe("payloadHash", () => {
  it("is the same for the same lines however the keys are ordered", () => {
    expect(payloadHash({ lines: [{ qty: 2, partId: "p_1" }] })).toBe(
      payloadHash({ lines: [{ partId: "p_1", qty: 2 }] }),
    );
    expect(payloadHash({ lines: [{ partId: "p_1", qty: 3 }] })).not.toBe(
      payloadHash({ lines: [{ partId: "p_1", qty: 2 }] }),
    );
  });
});

describe("OrdersService.confirm", () => {
  it("returns the confirmed order after a successful update", async () => {
    const repository = stubs();
    const confirmed: OrderResponse = {
      ...ORDER,
      status: "confirmed",
      confirmedAt: "2026-09-23T08:05:00.000Z",
    };
    repository.find.mockResolvedValueOnce(confirmed);
    const service = await serviceWith(repository);

    expect(await service.confirm(ORDER.id)).toEqual(confirmed);
  });

  it("answers 409 for an expired order, 200 for one already confirmed and 404 for none", async () => {
    const repository = stubs();
    repository.confirm.mockResolvedValue(false);
    const service = await serviceWith(repository);

    repository.find.mockResolvedValueOnce({ ...ORDER, status: "expired" });
    await expect(service.confirm(ORDER.id)).rejects.toMatchObject({
      status: 409,
      message: "Order has expired",
    });

    const confirmed: OrderResponse = {
      ...ORDER,
      status: "confirmed",
      confirmedAt: "2026-09-23T08:05:00.000Z",
    };
    repository.find.mockResolvedValueOnce(confirmed);
    expect(await service.confirm(ORDER.id)).toEqual(confirmed);

    await expect(service.confirm("ord_nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
