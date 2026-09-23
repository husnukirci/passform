import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../app.module.js";

describe("GET /health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // The whole AppModule boots so the wiring is what runs in production.
    // Nothing connects at init, so the services only need to be named.
    process.env.DATABASE_URL = "postgres://passform:passform@postgres.invalid:5432/passform";
    process.env.ELASTICSEARCH_URL = "http://elasticsearch.invalid:9200";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responds 200 { ok: true }", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
