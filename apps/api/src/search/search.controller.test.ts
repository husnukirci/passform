import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ErrorFilter } from "../infra/http/error.filter.js";
import { SearchController } from "./search.controller.js";
import { SearchService } from "./search.service.js";

const service: Pick<SearchService, "search"> = {
  search: async (input) => ({
    hits: [],
    stages: { fitted: 0, shown: 0 },
    page: input.page,
    pageSize: 24,
  }),
};

describe("SearchController", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: service },
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

  it("GET /search coerces page and defaults sort", async () => {
    const response = await request(app.getHttpServer()).get("/search?variantId=v_000001&page=3");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hits: [],
      stages: { fitted: 0, shown: 0 },
      page: 3,
      pageSize: 24,
    });
  });

  it("GET /search answers 400 without a variantId and for a bad axle", async () => {
    const missing = await request(app.getHttpServer()).get("/search");
    const axle = await request(app.getHttpServer()).get("/search?variantId=v_000001&axle=left");

    expect(missing.status).toBe(400);
    expect(missing.body.issues).toEqual([{ path: "variantId", message: expect.any(String) }]);
    expect(axle.status).toBe(400);
    expect(axle.body.issues).toEqual([{ path: "axle", message: expect.any(String) }]);
  });
});
