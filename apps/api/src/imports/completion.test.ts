import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { INDEX_REBUILD, type RebuildJob } from "../infra/queues.js";
import { ImportCompletion } from "./completion.js";
import { type ChunkOutcomes, ImportsRepository, type ImportSummary } from "./imports.repository.js";

async function completionWith(chunks: ChunkOutcomes, failedRows = 0) {
  const summary: ImportSummary = {
    id: "imp_1",
    supplierId: "s_01",
    status: "running",
    totalRows: 3000,
    processedRows: 3000 - failedRows,
    failedRows,
    chunks,
    startedAt: new Date(),
    finishedAt: null,
    error: null,
  };
  const repository = {
    summary: vi.fn(async () => summary),
    finish: vi.fn(async () => undefined),
  } satisfies Pick<ImportsRepository, "summary" | "finish">;
  const add = vi.fn(async () => undefined);
  const queue: Pick<Queue<RebuildJob>, "add"> = { add: add as never };
  const moduleRef = await Test.createTestingModule({
    providers: [
      ImportCompletion,
      { provide: ImportsRepository, useValue: repository },
      { provide: getQueueToken(INDEX_REBUILD), useValue: queue },
    ],
  }).compile();
  return { completion: moduleRef.get(ImportCompletion), repository, add };
}

describe("ImportCompletion.check", () => {
  it("does nothing while a chunk is still pending", async () => {
    const { completion, repository, add } = await completionWith({
      pending: 1,
      done: 2,
      failed: 0,
    });

    await completion.check("imp_1");

    expect(repository.finish).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("completes the import and queues one deduplicated rebuild when every chunk is done", async () => {
    const { completion, repository, add } = await completionWith({
      pending: 0,
      done: 3,
      failed: 0,
    });

    await completion.check("imp_1");
    await completion.check("imp_1");

    expect(repository.finish).toHaveBeenCalledWith("imp_1", "completed");
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith("rebuild", { importId: "imp_1" }, { jobId: "rebuild-imp_1" });
  });

  it("marks the import partial when a chunk failed, and still rebuilds", async () => {
    const { completion, repository, add } = await completionWith({
      pending: 0,
      done: 2,
      failed: 1,
    });

    await completion.check("imp_1");

    expect(repository.finish).toHaveBeenCalledWith("imp_1", "partial");
    expect(add).toHaveBeenCalledOnce();
  });
});

describe("ImportCompletion.check with rejected rows", () => {
  it("marks the import partial when every chunk is done but rows were rejected", async () => {
    const { completion, repository } = await completionWith({ pending: 0, done: 3, failed: 0 }, 12);

    await completion.check("imp_1");

    expect(repository.finish).toHaveBeenCalledWith("imp_1", "partial");
  });
});
