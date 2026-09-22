import { Controller, Get, type INestApplication, NotFoundException, Query } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { DomainError } from "@passform/domain";
import { createZodDto, ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { ErrorFilter } from "./error.filter.js";

class PageQuery extends createZodDto(z.object({ page: z.coerce.number().int().min(1) })) {}

@Controller("boom")
class BoomController {
  @Get("zod")
  zod(@Query() query: PageQuery): PageQuery {
    return query;
  }

  @Get("domain")
  domain(): never {
    throw new DomainError("manufacturer: expected exactly 4 digits");
  }

  @Get("http")
  http(): never {
    throw new NotFoundException("variant v_nope not found");
  }

  @Get("crash")
  crash(): never {
    throw new Error("connection reset");
  }
}

describe("ErrorFilter", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BoomController],
      providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("maps a failed zod parse to 400 with one issue per field", async () => {
    const response = await request(app.getHttpServer()).get("/boom/zod?page=0");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      message: "Validation failed",
      issues: [{ path: "page", message: expect.stringContaining("1") }],
    });
  });

  it("maps a DomainError to 400 with its message", async () => {
    const response = await request(app.getHttpServer()).get("/boom/domain");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      message: "manufacturer: expected exactly 4 digits",
    });
  });

  it("keeps the status of a Nest HTTP exception", async () => {
    const response = await request(app.getHttpServer()).get("/boom/http");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ statusCode: 404, message: "variant v_nope not found" });
  });

  it("hides the details of anything else behind a 500", async () => {
    const response = await request(app.getHttpServer()).get("/boom/crash");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ statusCode: 500, message: "Internal server error" });
  });
});
