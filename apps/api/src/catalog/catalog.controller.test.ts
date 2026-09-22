import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ErrorFilter } from "../infra/http/error.filter.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";

const service: Pick<CatalogService, "categoryTree" | "partDetail"> = {
  categoryTree: async () => ({
    categories: [{ id: "brakes", name: "Brakes", children: [] }],
  }),
  partDetail: async () => {
    throw new Error("not reached");
  },
};

describe("CatalogController", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        { provide: CatalogService, useValue: service },
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

  it("GET /categories answers 200 with the tree", async () => {
    const response = await request(app.getHttpServer()).get("/categories");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      categories: [{ id: "brakes", name: "Brakes", children: [] }],
    });
  });

  it("GET /parts/:sku answers 400 for an empty variantId", async () => {
    const response = await request(app.getHttpServer()).get("/parts/QRB-0000001?variantId=");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      message: "Validation failed",
      issues: [{ path: "variantId", message: expect.any(String) }],
    });
  });
});
