import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HealthController } from "./health.controller.js";

describe("GET /health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // The controller alone: since Phase 5 the AppModule's queue workers
    // connect to Redis at init, so the whole-app wiring is exercised by the
    // integration tests against the compose services instead.
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
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
