import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ErrorFilter } from "../infra/http/error.filter.js";
import { ImportsController } from "./imports.controller.js";
import { ImportsService } from "./imports.service.js";

const create = vi.fn(async () => ({ importId: "imp_1" }));
const service: Pick<ImportsService, "create" | "get"> = {
  create,
  get: async () => ({
    id: "imp_1",
    status: "completed",
    totalRows: 2500,
    processedRows: 2500,
    failedRows: 0,
    chunks: { pending: 0, done: 3, failed: 0 },
    startedAt: "2026-09-23T08:00:00.000Z",
    finishedAt: "2026-09-23T08:00:05.000Z",
    error: null,
  }),
};

describe("ImportsController", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "passform-imports-http-"));
    process.env.DATA_DIR = dir;
    await writeFile(join(dir, "rows.jsonl"), "{}\n");
    const moduleRef = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [
        { provide: ImportsService, useValue: service },
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
    delete process.env.DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("POST /imports answers 202 with the import id for a path under DATA_DIR", async () => {
    const response = await request(app.getHttpServer())
      .post("/imports")
      .send({ supplierId: "s_01", path: "rows.jsonl" });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ importId: "imp_1" });
    expect(create).toHaveBeenCalledWith({ supplierId: "s_01", filePath: join(dir, "rows.jsonl") });
  });

  it("POST /imports accepts a multipart file and imports the uploaded copy", async () => {
    const response = await request(app.getHttpServer())
      .post("/imports")
      .field("supplierId", "s_01")
      .attach("file", Buffer.from("{}\n"), "supplier.jsonl");

    expect(response.status).toBe(202);
    expect(create).toHaveBeenLastCalledWith({
      supplierId: "s_01",
      filePath: expect.stringMatching(
        new RegExp(`^${join(dir, "imports", "uploads")}/.*\\.jsonl$`),
      ),
    });
  });

  it("POST /imports answers 400 without a file or path, and for a path outside DATA_DIR", async () => {
    const neither = await request(app.getHttpServer())
      .post("/imports")
      .send({ supplierId: "s_01" });
    expect(neither.status).toBe(400);
    expect(neither.body.message).toContain("multipart file or a path");

    const outside = await request(app.getHttpServer())
      .post("/imports")
      .send({ supplierId: "s_01", path: "../etc/passwd" });
    expect(outside.status).toBe(400);
    expect(outside.body.message).toContain("inside DATA_DIR");
  });

  it("POST /imports answers 404 for a path that is not there", async () => {
    const response = await request(app.getHttpServer())
      .post("/imports")
      .send({ supplierId: "s_01", path: "nope.jsonl" });

    expect(response.status).toBe(404);
  });

  it("GET /imports/:id answers 200 with the status body", async () => {
    const response = await request(app.getHttpServer()).get("/imports/imp_1");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "imp_1", status: "completed", chunks: { done: 3 } });
  });
});
