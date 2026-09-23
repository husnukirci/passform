import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getQueueToken } from "@nestjs/bullmq";
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type ChunkJob, IMPORT_CHUNK } from "../infra/queues.js";
import { ImportsRepository, type ImportSummary } from "./imports.repository.js";
import { ImportsService } from "./imports.service.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "passform-imports-"));
  process.env.DATA_DIR = dir;
});

afterAll(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

type Repository = Pick<
  ImportsRepository,
  "supplierExists" | "create" | "addChunks" | "start" | "finish" | "summary"
>;

function stubs(summary: ImportSummary | null = null) {
  const repository = {
    supplierExists: vi.fn(async (id: string) => id === "s_01"),
    create: vi.fn(async () => undefined),
    addChunks: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    finish: vi.fn(async () => undefined),
    summary: vi.fn(async () => summary),
  } satisfies Repository;
  const addBulk = vi.fn(async () => []);
  const queue: Pick<Queue<ChunkJob>, "addBulk"> = { addBulk: addBulk as never };
  return { repository, queue, addBulk };
}

async function serviceWith(repository: Repository, queue: Pick<Queue<ChunkJob>, "addBulk">) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ImportsService,
      { provide: ImportsRepository, useValue: repository },
      { provide: getQueueToken(IMPORT_CHUNK), useValue: queue },
    ],
  }).compile();
  return moduleRef.get(ImportsService);
}

describe("ImportsService.create", () => {
  it("records the import, splits the file and queues one identity-only job per chunk", async () => {
    const filePath = join(dir, "rows.jsonl");
    await writeFile(filePath, Array.from({ length: 1500 }, (_, i) => `{"n":${i}}`).join("\n"));
    const { repository, queue, addBulk } = stubs();
    const service = await serviceWith(repository, queue);

    const { importId } = await service.create({ supplierId: "s_01", filePath });

    expect(importId).toMatch(/^imp_[0-9a-f]{12}$/);
    expect(repository.create).toHaveBeenCalledWith({
      id: importId,
      supplierId: "s_01",
      filePath,
      chunkSize: 1000,
    });
    expect(repository.addChunks).toHaveBeenCalledWith(importId, 1500, [
      { seq: 0, rowFrom: 0, rowTo: 1000 },
      { seq: 1, rowFrom: 1000, rowTo: 1500 },
    ]);
    // `running` is set before the jobs exist, so a fast chunk cannot race the status.
    expect(repository.start.mock.invocationCallOrder[0]).toBeLessThan(
      addBulk.mock.invocationCallOrder[0] ?? 0,
    );
    expect(addBulk).toHaveBeenCalledWith([
      { name: "chunk", data: { importId, seq: 0 }, opts: { jobId: `${importId}-0` } },
      { name: "chunk", data: { importId, seq: 1 }, opts: { jobId: `${importId}-1` } },
    ]);
    expect(repository.finish).not.toHaveBeenCalled();
  });

  it("completes an empty file on the spot, with no jobs and no rebuild", async () => {
    const filePath = join(dir, "empty.jsonl");
    await writeFile(filePath, "\n");
    const { repository, queue, addBulk } = stubs();
    const service = await serviceWith(repository, queue);

    const { importId } = await service.create({ supplierId: "s_01", filePath });

    expect(repository.addChunks).toHaveBeenCalledWith(importId, 0, []);
    expect(repository.finish).toHaveBeenCalledWith(importId, "completed");
    expect(repository.start).not.toHaveBeenCalled();
    expect(addBulk).not.toHaveBeenCalled();
  });

  it("marks the import failed and rethrows when the split cannot read the file", async () => {
    const { repository, queue } = stubs();
    const service = await serviceWith(repository, queue);

    await expect(
      service.create({ supplierId: "s_01", filePath: join(dir, "missing.jsonl") }),
    ).rejects.toMatchObject({ code: "ENOENT" });

    expect(repository.finish).toHaveBeenCalledWith(expect.stringMatching(/^imp_/), "failed", {
      message: expect.stringContaining("ENOENT"),
    });
  });

  it("answers 404 for a supplier that does not exist, before writing anything", async () => {
    const { repository, queue } = stubs();
    const service = await serviceWith(repository, queue);

    await expect(
      service.create({ supplierId: "s_99", filePath: join(dir, "rows.jsonl") }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe("ImportsService.get", () => {
  it("returns the summary with ISO timestamps and 404 for an unknown id", async () => {
    const summary: ImportSummary = {
      id: "imp_1",
      supplierId: "s_01",
      status: "running",
      totalRows: 2500,
      processedRows: 1000,
      failedRows: 0,
      chunks: { pending: 2, done: 1, failed: 0 },
      startedAt: new Date("2026-09-23T08:00:00Z"),
      finishedAt: null,
      error: null,
    };
    const { repository, queue } = stubs(summary);
    const service = await serviceWith(repository, queue);

    expect(await service.get("imp_1")).toEqual({
      id: "imp_1",
      status: "running",
      totalRows: 2500,
      processedRows: 1000,
      failedRows: 0,
      chunks: { pending: 2, done: 1, failed: 0 },
      startedAt: "2026-09-23T08:00:00.000Z",
      finishedAt: null,
      error: null,
    });

    repository.summary.mockResolvedValueOnce(null);
    await expect(service.get("imp_nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
