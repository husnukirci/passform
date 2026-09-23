// One `import.chunk` job: load the chunk row, short-circuit if it is already
// done, validate the rows with the domain, persist in one transaction. Any
// thrown error counts an attempt and is rethrown for BullMQ to retry; after
// the last attempt the job is copied to the dead-letter queue and the chunk
// marked `failed` (ADR 8).

import { readFile } from "node:fs/promises";

import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job, Queue } from "bullmq";

import type { InvalidRow } from "../infra/db/schema.js";
import {
  type ChunkJob,
  chunkJobId,
  type DeadLetter,
  IMPORT_CHUNK,
  IMPORT_CHUNK_DLQ,
  IMPORT_CHUNK_WORKER,
} from "../infra/queues.js";
import { ImportCompletion } from "./completion.js";
import { chunkReport, ImportsRepository } from "./imports.repository.js";
import { checkReferences, parseChunk, referencedIds } from "./rows.js";
import { chunkPath } from "./splitter.js";

@Processor(IMPORT_CHUNK, IMPORT_CHUNK_WORKER)
export class ChunkProcessor extends WorkerHost {
  private readonly logger = new Logger(ChunkProcessor.name);

  constructor(
    private readonly imports: ImportsRepository,
    private readonly completion: ImportCompletion,
    @InjectQueue(IMPORT_CHUNK_DLQ) private readonly deadLetters: Queue<DeadLetter>,
  ) {
    super();
  }

  async process(job: Job<ChunkJob>): Promise<void> {
    const { importId, seq } = job.data;
    const chunk = await this.imports.chunk(importId, seq);
    if (chunk === null) throw new Error(`chunk ${chunkJobId(job.data)} does not exist`);
    if (chunk.status === "done") return;

    let invalid: InvalidRow[] = [];
    try {
      const lines = await readLines(chunkPath(importId, seq));
      const parsed = parseChunk(lines, chunk.rowFrom);
      const known = await this.imports.knownReferences(referencedIds(parsed.valid));
      const prepared = checkReferences(parsed, known);
      invalid = prepared.invalid;
      await this.imports.applyChunk({ importId, seq, supplierId: chunk.supplierId, ...prepared });
    } catch (error) {
      await this.imports.recordChunkFailure(importId, seq, chunkReport(messageOf(error), invalid));
      throw error;
    }
  }

  /** Every failed attempt lands here; only the last one dead-letters the chunk. */
  @OnWorkerEvent("failed")
  async onFailed(job: Job<ChunkJob> | undefined, error: Error): Promise<void> {
    if (job === undefined || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const { importId, seq } = job.data;
    try {
      const chunk = await this.imports.chunk(importId, seq);
      await this.imports.markChunkFailed(importId, seq);
      await this.deadLetters.add(
        "chunk",
        { importId, seq, error: error.message, invalidRows: chunk?.report?.invalidRows ?? [] },
        { jobId: chunkJobId(job.data) },
      );
      this.logger.warn(
        `${chunkJobId(job.data)} dead-lettered after ${job.attemptsMade} attempts: ${error.message}`,
      );
      await this.completion.check(importId);
    } catch (handlerError) {
      this.logger.error(
        `${chunkJobId(job.data)}: could not dead-letter: ${messageOf(handlerError)}`,
      );
    }
  }
}

async function readLines(path: string): Promise<string[]> {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter((line) => line.length > 0);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
