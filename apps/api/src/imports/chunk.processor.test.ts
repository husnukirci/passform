import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type ChunkJob, IMPORT_CHUNK_DLQ } from "../infra/queues.js";
import { ChunkProcessor } from "./chunk.processor.js";
import { ImportCompletion } from "./completion.js";
import { type ChunkRecord, ImportsRepository } from "./imports.repository.js";
import { chunkPath, importDir } from "./splitter.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "passform-chunk-"));
  process.env.DATA_DIR = dir;
});

afterAll(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

function chunk(overrides: Partial<ChunkRecord> = {}): ChunkRecord {
  return {
    importId: "imp_1",
    seq: 0,
    status: "pending",
    attempts: 0,
    rowFrom: 0,
    rowTo: 2,
    supplierId: "s_01",
    report: null,
    ...overrides,
  };
}

const line = (sku: string, categorySlug = "brakes/pads"): string =>
  JSON.stringify({
    sku,
    brand: "Quorabrake",
    brandTier: "premium",
    categorySlug,
    name: `Quorabrake Pads ${sku}`,
    oeRef: "VEL-12345",
    attributes: {},
    priceCents: 4990,
    stockQty: 3,
    universal: true,
    fitments: [],
  });

async function processorWith(record: ChunkRecord) {
  const repository = {
    chunk: vi.fn(async () => record),
    knownReferences: vi.fn(async () => ({
      categories: new Set(["brakes/pads"]),
      variants: new Set<string>(),
    })),
    applyChunk: vi.fn(async () => undefined),
    recordChunkFailure: vi.fn(async () => undefined),
    markChunkFailed: vi.fn(async () => undefined),
  } satisfies Partial<ImportsRepository>;
  const completion = { check: vi.fn(async () => undefined) };
  const deadLetters = { add: vi.fn(async () => undefined) };
  const moduleRef = await Test.createTestingModule({
    providers: [
      ChunkProcessor,
      { provide: ImportsRepository, useValue: repository },
      { provide: ImportCompletion, useValue: completion },
      { provide: getQueueToken(IMPORT_CHUNK_DLQ), useValue: deadLetters },
    ],
  }).compile();
  return { processor: moduleRef.get(ChunkProcessor), repository, completion, deadLetters };
}

function job(data: ChunkJob, overrides: Partial<Job<ChunkJob>> = {}): Job<ChunkJob> {
  // Only the fields the processor reads; the rest of Job is not touched.
  return { data, attemptsMade: 0, opts: { attempts: 5 }, ...overrides } as Job<ChunkJob>;
}

describe("ChunkProcessor.process", () => {
  it("validates the chunk file, resolves references and hands the rows to one transaction", async () => {
    await mkdir(importDir("imp_1"), { recursive: true });
    await writeFile(chunkPath("imp_1", 0), `${line("A")}\n${line("B", "nope/none")}\n`);
    const { processor, repository } = await processorWith(chunk());

    await processor.process(job({ importId: "imp_1", seq: 0 }));

    expect(repository.knownReferences).toHaveBeenCalledWith({
      categorySlugs: ["brakes/pads", "nope/none"],
      variantIds: [],
    });
    expect(repository.applyChunk).toHaveBeenCalledWith({
      importId: "imp_1",
      seq: 0,
      supplierId: "s_01",
      rows: [expect.objectContaining({ sku: "A" })],
      accepted: 1,
      invalid: [{ row: 1, errors: ['categorySlug: unknown category "nope/none"'] }],
    });
    expect(repository.recordChunkFailure).not.toHaveBeenCalled();
  });

  it("returns without reading or writing anything when the chunk is already done", async () => {
    const { processor, repository } = await processorWith(chunk({ status: "done" }));

    await processor.process(job({ importId: "imp_1", seq: 0 }));

    expect(repository.knownReferences).not.toHaveBeenCalled();
    expect(repository.applyChunk).not.toHaveBeenCalled();
    expect(repository.recordChunkFailure).not.toHaveBeenCalled();
  });

  it("counts the attempt with the error and rethrows when the chunk file is missing", async () => {
    const { processor, repository } = await processorWith(chunk({ seq: 7 }));

    await expect(processor.process(job({ importId: "imp_1", seq: 7 }))).rejects.toMatchObject({
      code: "ENOENT",
    });

    expect(repository.recordChunkFailure).toHaveBeenCalledWith("imp_1", 7, {
      message: expect.stringContaining("ENOENT"),
      invalidRowCount: 0,
      invalidRows: [],
    });
  });
});

describe("ChunkProcessor.onFailed", () => {
  it("ignores attempts that BullMQ will retry", async () => {
    const { processor, repository, deadLetters, completion } = await processorWith(chunk());

    await processor.onFailed(
      job({ importId: "imp_1", seq: 0 }, { attemptsMade: 2 }),
      new Error("x"),
    );

    expect(repository.markChunkFailed).not.toHaveBeenCalled();
    expect(deadLetters.add).not.toHaveBeenCalled();
    expect(completion.check).not.toHaveBeenCalled();
  });

  it("dead-letters the chunk with its report after the last attempt and rechecks completion", async () => {
    const report = {
      message: "boom",
      invalidRowCount: 1,
      invalidRows: [{ row: 3, errors: ["x"] }],
    };
    const { processor, repository, deadLetters, completion } = await processorWith(
      chunk({ report }),
    );

    await processor.onFailed(
      job({ importId: "imp_1", seq: 0 }, { attemptsMade: 5 }),
      new Error("boom"),
    );

    expect(repository.markChunkFailed).toHaveBeenCalledWith("imp_1", 0);
    expect(deadLetters.add).toHaveBeenCalledWith(
      "chunk",
      { importId: "imp_1", seq: 0, error: "boom", invalidRows: [{ row: 3, errors: ["x"] }] },
      { jobId: "imp_1-0" },
    );
    expect(completion.check).toHaveBeenCalledWith("imp_1");
  });
});
