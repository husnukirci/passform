import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { INDEX_REBUILD, type RebuildJob } from "../infra/queues.js";
import { ImportCompletion } from "./completion.js";
import { type ChunkOutcomes, ImportsRepository } from "./imports.repository.js";

async function completionWith(outcomes: ChunkOutcomes) {
  const repository = {
    chunkOutcomes: vi.fn(async () => outcomes),
    finish: vi.fn(async () => undefined),
  } satisfies Pick<ImportsRepository, "chunkOutcomes" | "finish">;
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
    expect(add).toHaveBeenCalledWith("rebuild", { importId: "imp_1" }, { jobId: "rebuild:imp_1" });
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
