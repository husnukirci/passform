// BullMQ wiring: the Redis connection from REDIS_URL, the queue names, and
// the job and worker options the import pipeline runs with (ADR 8). Three
// queues because they fail differently: a chunk retries with backoff and
// then dead-letters; a rebuild runs once per import and reports through
// the import row; the dead-letter queue has no worker and exists to be read.

import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { createIORedisClient, type JobsOptions, RedisConnection, type RedisOptions } from "bullmq";
import { Redis } from "ioredis";

import type { InvalidRow } from "./db/schema.js";

// BullMQ 6 treats ioredis as an optional driver and loads it with `require`,
// which a native ES module does not have. The factory hands it a client for
// every connection it opens itself (queues, workers' blocking connections,
// queue events), with the options BullMQ has already adjusted for blocking.
RedisConnection.clientFactory = (options) => createIORedisClient(new Redis(options));

export const IMPORT_CHUNK = "import.chunk";
export const INDEX_REBUILD = "index.rebuild";
export const IMPORT_CHUNK_DLQ = "import.chunk.dlq";

/** Job payloads carry identities only; the processor loads everything else from Postgres. */
export interface ChunkJob {
  importId: string;
  seq: number;
}

export interface RebuildJob {
  importId: string;
}

/**
 * A dead letter is a record, not work: it keeps the final error and the
 * rows the chunk had rejected so the failure can be read in Bull Board
 * without opening Postgres.
 */
export interface DeadLetter extends ChunkJob {
  error: string;
  invalidRows: InvalidRow[];
}

/**
 * `<importId>-<seq>`, so re-adding a chunk's job is a no-op while the first
 * is kept. A hyphen because BullMQ reserves the colon in job ids, and import
 * ids (`imp_<hex>`) never contain one.
 */
export function chunkJobId({ importId, seq }: ChunkJob): string {
  return `${importId}-${seq}`;
}

export function importIdOfChunkJob(jobId: string): string {
  const at = jobId.lastIndexOf("-");
  return at === -1 ? jobId : jobId.slice(0, at);
}

/** One rebuild per import, however many listeners notice the import finishing. */
export function rebuildJobId(importId: string): string {
  return `rebuild-${importId}`;
}

/** ioredis options parsed from REDIS_URL; BullMQ adds the blocking-connection settings itself. */
export function redisConnection(): RedisOptions {
  const raw = process.env.REDIS_URL;
  if (!raw) throw new Error("REDIS_URL is not set");
  const url = new URL(raw);
  const db = Number(url.pathname.slice(1));
  return {
    host: url.hostname,
    port: url.port === "" ? 6379 : Number(url.port),
    ...(url.password !== "" && { password: decodeURIComponent(url.password) }),
    ...(Number.isInteger(db) && db > 0 && { db }),
  };
}

/**
 * Five attempts with exponential backoff from two seconds, failed jobs kept
 * for inspection. The two retry knobs read the environment so the
 * integration tests can run the same code with `attempts: 2, delay: 10`.
 */
export function importChunkJobOptions(): JobsOptions {
  return {
    attempts: integerEnv("IMPORT_CHUNK_ATTEMPTS", 5),
    backoff: { type: "exponential", delay: integerEnv("IMPORT_CHUNK_BACKOFF_MS", 2000) },
    removeOnComplete: 1000,
    removeOnFail: false,
  };
}

/** Four chunks in flight and at most four started per second, so an import cannot starve the read path's pool. */
export const IMPORT_CHUNK_WORKER = { concurrency: 4, limiter: { max: 4, duration: 1000 } } as const;

function integerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name}: expected a positive integer, got "${raw}"`);
  return value;
}

/** Connection and the three queues, read lazily so nothing touches the environment at import time. */
@Module({
  imports: [
    BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection() }) }),
    BullModule.registerQueueAsync({
      name: IMPORT_CHUNK,
      useFactory: () => ({ defaultJobOptions: importChunkJobOptions() }),
    }),
    BullModule.registerQueue({ name: INDEX_REBUILD }, { name: IMPORT_CHUNK_DLQ }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
