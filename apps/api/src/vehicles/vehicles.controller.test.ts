import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ErrorFilter } from "../infra/http/error.filter.js";
import { variant } from "./fixtures.js";
import { VehiclesController } from "./vehicles.controller.js";
import { VehiclesRepository } from "./vehicles.repository.js";
import { VehiclesService } from "./vehicles.service.js";

const repository: Pick<VehiclesRepository, "findByKey" | "findById"> = {
  findByKey: async () => [variant()],
  findById: async (id) => (id === "v_000001" ? variant() : null),
};

describe("VehiclesController", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        VehiclesService,
        { provide: VehiclesRepository, useValue: repository },
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

  it("GET /vehicles/resolve answers 200 with the variants and the flag", async () => {
    const response = await request(app.getHttpServer()).get(
      "/vehicles/resolve?manufacturer=1103&type=001",
    );

    expect(response.status).toBe(200);
    expect(response.body.needsDisambiguation).toBe(false);
    expect(response.body.variants[0].label).toBe("D16-85 · 85 kW · diesel · 2012-03 → 2018-06");
  });

  it("GET /vehicles/resolve answers 400 for a malformed key", async () => {
    const response = await request(app.getHttpServer()).get(
      "/vehicles/resolve?manufacturer=12&type=001",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      message: "manufacturer: expected exactly 4 digits",
    });
  });

  it("GET /vehicles/models answers 400 without a make", async () => {
    const response = await request(app.getHttpServer()).get("/vehicles/models");

    expect(response.status).toBe(400);
    expect(response.body.issues).toEqual([{ path: "make", message: expect.any(String) }]);
  });

  it("GET /vehicles/:id answers 404 for an unknown id", async () => {
    const response = await request(app.getHttpServer()).get("/vehicles/v_nope");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ statusCode: 404, message: "vehicle v_nope not found" });
  });
});
