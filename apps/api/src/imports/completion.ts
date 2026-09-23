// Closes an import once every chunk is terminal and queues the rebuild.
// Triggered from the chunk queue's events and, for a failed chunk, from the
// processor's dead-letter handler after the chunk row is marked, because
// the queue event can arrive before that write lands. Firing twice is safe:
// the status update is conditional and the rebuild's job id dedupes.

import { InjectQueue, OnQueueEvent, QueueEventsHost, QueueEventsListener } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";

import {
  IMPORT_CHUNK,
  importIdOfChunkJob,
  INDEX_REBUILD,
  type RebuildJob,
  rebuildJobId,
} from "../infra/queues.js";
import { ImportsRepository } from "./imports.repository.js";

@Injectable()
export class ImportCompletion {
  private readonly logger = new Logger(ImportCompletion.name);

  constructor(
    private readonly imports: ImportsRepository,
    @InjectQueue(INDEX_REBUILD) private readonly rebuilds: Queue<RebuildJob>,
  ) {}

  /** Finishes the import when nothing is pending; otherwise does nothing. */
  async check(importId: string): Promise<void> {
    const outcomes = await this.imports.chunkOutcomes(importId);
    if (outcomes.pending > 0) return;

    await this.imports.finish(importId, outcomes.failed > 0 ? "partial" : "completed");
    await this.rebuilds.add("rebuild", { importId }, { jobId: rebuildJobId(importId) });
    this.logger.log(
      `${importId}: ${outcomes.done} chunks done, ${outcomes.failed} failed, rebuild queued`,
    );
  }
}

@QueueEventsListener(IMPORT_CHUNK)
export class ChunkEventsListener extends QueueEventsHost {
  constructor(private readonly completion: ImportCompletion) {
    super();
  }

  @OnQueueEvent("completed")
  onCompleted({ jobId }: { jobId: string }): Promise<void> {
    return this.completion.check(importIdOfChunkJob(jobId));
  }

  /** Fires on every failed attempt; while a retry is pending the chunk is still `pending`. */
  @OnQueueEvent("failed")
  onFailed({ jobId }: { jobId: string }): Promise<void> {
    return this.completion.check(importIdOfChunkJob(jobId));
  }
}
