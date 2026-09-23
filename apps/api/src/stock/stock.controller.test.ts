import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { StockUpdateBody, StockUpdateResponse } from "@passform/contracts";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorFilter } from "../infra/http/error.filter.js";
import { StockController } from "./stock.controller.js";
import { StockService } from "./stock.service.js";

const RESPONSE: StockUpdateResponse = { updated: 1, unknown: ["QB-9999"], indexed: true };

const apply = vi.fn(async (_supplierId: string, _body: StockUpdateBody) => RESPONSE);
const service: Pick<StockService, "apply"> = { apply };

describe("StockController", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        { provide: StockService, useValue: service },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    apply.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it("PATCH /suppliers/:id/stock passes the id and the parsed body on and answers 200", async () => {
    const body = {
      rows: [
        { sku: "QB-1001", priceCents: 5290, stockQty: 5 },
        { sku: "QB-9999", stockQty: 0 },
      ],
    };

    const response = await request(app.getHttpServer()).patch("/suppliers/s_01/stock").send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(RESPONSE);
    expect(apply).toHaveBeenCalledWith("s_01", body);
  });

  it.each([
    ["an empty rows array", { rows: [] }],
    [
      "a repeated sku",
      {
        rows: [
          { sku: "QB-1001", priceCents: 1 },
          { sku: "QB-1001", stockQty: 1 },
        ],
      },
    ],
    ["a row with neither priceCents nor stockQty", { rows: [{ sku: "QB-1001" }] }],
  ])("PATCH /suppliers/:id/stock answers 400 for %s, before the service runs", async (_, body) => {
    const response = await request(app.getHttpServer()).patch("/suppliers/s_01/stock").send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(apply).not.toHaveBeenCalled();
  });
});
