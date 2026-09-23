import { BadRequestException, type INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { CreateOrderBody, OrderResponse } from "@passform/contracts";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ErrorFilter } from "../infra/http/error.filter.js";
import { OrdersController } from "./orders.controller.js";
import { type CreateOrderResult, OrdersService } from "./orders.service.js";

const KEY = "3f0a9d0e-5b8c-4c1d-9a2e-7f6b5c4d3e2f";
const ORDER: OrderResponse = {
  id: "ord_1",
  status: "placed",
  totalCents: 9980,
  lines: [{ partId: "p_0000001", sku: "QB-1001", name: "Pads", qty: 2, unitCents: 4990 }],
  expiresAt: "2026-09-23T08:15:00.000Z",
  confirmedAt: null,
};

const create = vi.fn(async (key: string | undefined, _body: CreateOrderBody) => {
  if (key === undefined) throw new BadRequestException("Idempotency-Key header is required");
  const result: CreateOrderResult = { statusCode: 201, order: ORDER };
  return result;
});
const service: Pick<OrdersService, "create" | "confirm" | "get"> = {
  create,
  confirm: async () => ({ ...ORDER, status: "confirmed", confirmedAt: "2026-09-23T08:05:00.000Z" }),
  get: async () => ORDER,
};

describe("OrdersController", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: service },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /orders passes the header and the parsed body on and answers with the service's status", async () => {
    const body = { lines: [{ partId: "p_0000001", qty: 2 }] };
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Idempotency-Key", KEY)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(ORDER);
    expect(create).toHaveBeenCalledWith(KEY, body);
  });

  it("POST /orders answers 200 when the service reports a replay", async () => {
    create.mockResolvedValueOnce({ statusCode: 200, order: ORDER });

    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Idempotency-Key", KEY)
      .send({ lines: [{ partId: "p_0000001", qty: 2 }] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ORDER);
  });

  it("POST /orders answers 400 without the header", async () => {
    const response = await request(app.getHttpServer())
      .post("/orders")
      .send({ lines: [{ partId: "p_0000001", qty: 2 }] });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Idempotency-Key");
  });

  it("POST /orders answers 400 for a body that fails the schema, before the service runs", async () => {
    create.mockClear();
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Idempotency-Key", KEY)
      .send({ lines: [] });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(create).not.toHaveBeenCalled();
  });

  it("POST /orders/:id/confirm answers 200 with the confirmed order", async () => {
    const response = await request(app.getHttpServer()).post("/orders/ord_1/confirm");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "ord_1", status: "confirmed" });
  });

  it("GET /orders/:id answers 200 with the order", async () => {
    const response = await request(app.getHttpServer()).get("/orders/ord_1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ORDER);
  });
});
