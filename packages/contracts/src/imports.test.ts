import { describe, expect, it } from "vitest";

import { CreateImportBody, ImportStatusResponse } from "./imports.ts";

describe("CreateImportBody", () => {
  it("accepts a supplier with or without a path, and rejects an empty path", () => {
    expect(CreateImportBody.parse({ supplierId: "s_01", path: "imports/x.jsonl" })).toEqual({
      supplierId: "s_01",
      path: "imports/x.jsonl",
    });
    expect(CreateImportBody.parse({ supplierId: "s_01" })).toEqual({ supplierId: "s_01" });
    expect(CreateImportBody.safeParse({ supplierId: "s_01", path: "" }).success).toBe(false);
  });
});

describe("ImportStatusResponse", () => {
  it("accepts a running import with ISO timestamps and a null error", () => {
    const status = {
      id: "imp_1",
      status: "running",
      totalRows: 2500,
      processedRows: 1000,
      failedRows: 0,
      chunks: { pending: 2, done: 1, failed: 0 },
      startedAt: "2026-09-23T08:00:00.000Z",
      finishedAt: null,
      error: null,
    };

    expect(ImportStatusResponse.parse(status)).toEqual(status);
  });

  it("rejects an unknown status", () => {
    expect(ImportStatusResponse.safeParse({ id: "imp_1", status: "paused" }).success).toBe(false);
  });
});
