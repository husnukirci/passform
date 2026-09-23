// The import pipeline end to end against the docker-compose Postgres, Redis
// and Elasticsearch. The worker runs in-process, Postgres holds the small
// profile, the three queues are obliterated before every test, chunk files
// go to a temporary DATA_DIR and the rebuilt index lands on a throwaway
// alias.

import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getQueueToken } from "@nestjs/bullmq";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CreateImportResponse, ImportStatusResponse } from "@passform/contracts";
import type { ImportRow } from "@passform/domain";
import type { Queue } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { generateDataset } from "../scripts/generate.js";
import { generateImportFile } from "../scripts/generate-import.js";
import { runMigrations } from "../scripts/migrate.js";
import { seedDatabase } from "../scripts/seed.js";
import { AppModule } from "../src/app.module.js";
import { ChunkProcessor } from "../src/imports/chunk.processor.js";
import { chunkPath } from "../src/imports/splitter.js";
import { closeDb, getDb } from "../src/infra/db/client.js";
import { fitments, importChunks, imports, parts } from "../src/infra/db/schema.js";
import {
  type ChunkJob,
  chunkJobId,
  type DeadLetter,
  IMPORT_CHUNK,
  IMPORT_CHUNK_DLQ,
  INDEX_REBUILD,
  type RebuildJob,
  rebuildJobId,
} from "../src/infra/queues.js";
import { aliasName } from "../src/search/alias.js";
import { closeEsClient, getEsClient } from "../src/search/es.client.js";

process.env.SEARCH_ALIAS = "parts_importtest";
// Two attempts ten milliseconds apart instead of five from two seconds.
process.env.IMPORT_CHUNK_ATTEMPTS = "2";
process.env.IMPORT_CHUNK_BACKOFF_MS = "10";

const IMPORT_FILE = "imports/s_01-2500.jsonl";
const db = getDb();
const es = getEsClient();
let dataDir: string;
/** SKUs in the generated file that the small profile does not have yet. */
let created = 0;
let app: INestApplication;
let chunks: Queue<ChunkJob>;
let rebuilds: Queue<RebuildJob>;
let deadLetters: Queue<DeadLetter>;

const api = (): ReturnType<typeof request> => request(app.getHttpServer());

async function startApp(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  chunks = app.get(getQueueToken(IMPORT_CHUNK));
  rebuilds = app.get(getQueueToken(INDEX_REBUILD));
  deadLetters = app.get(getQueueToken(IMPORT_CHUNK_DLQ));
}

async function dropTestIndices(): Promise<void> {
  const found = await es.cat.indices({ index: `${aliasName()}_v*`, format: "json" });
  for (const row of found)
    if (row.index !== undefined) await es.indices.delete({ index: row.index });
}

async function countRows(table: typeof parts | typeof fitments): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
}

async function chunkRow(importId: string, seq: number) {
  const [row] = await db
    .select()
    .from(importChunks)
    .where(and(eq(importChunks.importId, importId), eq(importChunks.seq, seq)));
  if (row === undefined) throw new Error(`chunk ${importId}:${seq} is missing`);
  return row;
}

async function fileRows(name: string): Promise<ImportRow[]> {
  const text = await readFile(join(dataDir, name), "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ImportRow);
}

/** Polls `probe` until it answers something other than undefined. */
async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  what: string,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function startImport(path = IMPORT_FILE): Promise<string> {
  const response = await api().post("/imports").send({ supplierId: "s_01", path });
  expect(response.status).toBe(202);
  const body: CreateImportResponse = response.body;
  return body.importId;
}

async function statusOf(importId: string): Promise<ImportStatusResponse> {
  const response = await api().get(`/imports/${importId}`);
  expect(response.status).toBe(200);
  return response.body;
}

/** Waits for the import to end and, when a rebuild was queued, for the rebuild to end too. */
async function settle(importId: string): Promise<ImportStatusResponse> {
  const final = await waitFor(async () => {
    const status = await statusOf(importId);
    return status.status === "queued" || status.status === "running" ? undefined : status;
  }, `import ${importId} to finish`);
  await waitFor(async () => {
    const job = await rebuilds.getJob(rebuildJobId(importId));
    if (job === undefined) return true;
    return (await job.isCompleted()) || (await job.isFailed()) ? true : undefined;
  }, "the rebuild to finish");
  return final;
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "passform-import-data-"));
  process.env.DATA_DIR = dataDir;
  await dropTestIndices();
  await runMigrations();
  const seedDir = await mkdtemp(join(tmpdir(), "passform-import-seed-"));
  try {
    await generateDataset({ profile: "small", out: seedDir });
    await seedDatabase({ from: seedDir });
    const result = await generateImportFile({
      rows: 2500,
      supplier: "s_01",
      from: seedDir,
      out: join(dataDir, IMPORT_FILE),
    });
    created = result.created;
  } finally {
    await rm(seedDir, { recursive: true, force: true });
  }
  await startApp();
}, 180_000);

beforeEach(async () => {
  await db.execute(sql`truncate ${imports} cascade`);
  for (const queue of [chunks, rebuilds, deadLetters]) await queue.obliterate({ force: true });
});

afterAll(async () => {
  await app.close();
  await dropTestIndices();
  await closeEsClient();
  await closeDb();
  await rm(dataDir, { recursive: true, force: true });
});

describe("a valid 2,500-row file", () => {
  it("completes, upserts every part and rebuilds the index once", async () => {
    const partsBefore = await countRows(parts);
    const rows = await fileRows(IMPORT_FILE);
    // One row that updates a part the seed has, one that creates a new SKU.
    const existing = await db.select({ id: parts.id, sku: parts.sku }).from(parts);
    const known = new Map(existing.map((row) => [row.sku, row.id]));
    const update = rows.find((row) => known.has(row.sku));
    const insert = rows.find((row) => !known.has(row.sku));
    if (update === undefined || insert === undefined) throw new Error("file lacks a case");

    const importId = await startImport();
    const final = await settle(importId);

    expect(final).toMatchObject({
      id: importId,
      status: "completed",
      totalRows: 2500,
      processedRows: 2500,
      failedRows: 0,
      chunks: { pending: 0, done: 3, failed: 0 },
      error: null,
    });
    expect(final.startedAt).not.toBeNull();
    expect(final.finishedAt).not.toBeNull();

    expect(await countRows(parts)).toBe(partsBefore + created);
    const [updated] = await db.select().from(parts).where(eq(parts.sku, update.sku));
    expect(updated).toMatchObject({
      id: known.get(update.sku),
      priceCents: update.priceCents,
      stockQty: update.stockQty,
      supplierId: "s_01",
    });
    const updatedFitments = await db
      .select()
      .from(fitments)
      .where(eq(fitments.partId, known.get(update.sku) ?? ""));
    expect(updatedFitments.map((row) => row.variantId).sort()).toEqual(
      update.fitments.map((fitment) => fitment.variantId).sort(),
    );
    const [inserted] = await db.select().from(parts).where(eq(parts.sku, insert.sku));
    expect(inserted?.id).toBe(`p_${insert.sku}`);

    const rebuild = await rebuilds.getJob(rebuildJobId(importId));
    expect(rebuild?.data).toEqual({ importId });
    expect(await rebuild?.isCompleted()).toBe(true);
    expect((await es.count({ index: aliasName() })).count).toBe(partsBefore + created);
  }, 60_000);

  it("re-running a done chunk's job touches nothing", async () => {
    const importId = await startImport();
    await settle(importId);
    const before = {
      parts: await countRows(parts),
      fitments: await countRows(fitments),
      chunk: await chunkRow(importId, 0),
      status: await statusOf(importId),
    };
    expect(before.chunk).toMatchObject({ status: "done", attempts: 1 });

    const jobId = chunkJobId({ importId, seq: 0 });
    await (await chunks.getJob(jobId))?.remove();
    await chunks.add("chunk", { importId, seq: 0 }, { jobId });
    await waitFor(
      async () => ((await (await chunks.getJob(jobId))?.isCompleted()) ? true : undefined),
      "the re-run to complete",
    );

    expect(await countRows(parts)).toBe(before.parts);
    expect(await countRows(fitments)).toBe(before.fitments);
    expect(await chunkRow(importId, 0)).toEqual(before.chunk);
    expect(await statusOf(importId)).toEqual(before.status);
    // The completion listener fired again and the rebuild's job id absorbed it.
    expect(await rebuilds.getJobCounts("completed", "waiting", "active", "delayed")).toEqual({
      completed: 1,
      waiting: 0,
      active: 0,
      delayed: 0,
    });
  }, 60_000);

  it("resumes the remaining chunks after the worker is restarted", async () => {
    // One chunk at a time, so stopping after chunk 0 leaves work behind.
    app.get(ChunkProcessor).worker.concurrency = 1;
    const importId = await startImport();
    await waitFor(
      async () => ((await chunkRow(importId, 0)).status === "done" ? true : undefined),
      "chunk 0",
    );

    await app.close();
    const [leftBehind] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(importChunks)
      .where(and(eq(importChunks.importId, importId), eq(importChunks.status, "pending")));
    expect(leftBehind?.n).toBeGreaterThan(0);
    await startApp();

    const final = await settle(importId);
    expect(final).toMatchObject({
      status: "completed",
      processedRows: 2500,
      chunks: { pending: 0, done: 3, failed: 0 },
    });
  }, 60_000);
});

describe("a file whose second chunk points at an unknown category", () => {
  it("rejects those rows, keeps the chunk done and ends the import partial", async () => {
    const rows = await fileRows(IMPORT_FILE);
    const lines = rows.map((row, i) =>
      JSON.stringify(i >= 1000 && i < 2000 ? { ...row, categorySlug: "nope/none" } : row),
    );
    await writeFile(join(dataDir, "imports/s_01-partial.jsonl"), `${lines.join("\n")}\n`);

    const importId = await startImport("imports/s_01-partial.jsonl");
    const final = await settle(importId);

    expect(final).toMatchObject({
      status: "partial",
      totalRows: 2500,
      processedRows: 1500,
      failedRows: 1000,
      chunks: { pending: 0, done: 3, failed: 0 },
      error: null,
    });
    const chunk = await chunkRow(importId, 1);
    expect(chunk.status).toBe("done");
    expect(chunk.error).toMatchObject({ message: null, invalidRowCount: 1000 });
    expect(chunk.error?.invalidRows).toHaveLength(100);
    expect(chunk.error?.invalidRows[0]).toEqual({
      row: 1000,
      errors: ['categorySlug: unknown category "nope/none"'],
    });
    expect(await deadLetters.count()).toBe(0);
    expect(await (await rebuilds.getJob(rebuildJobId(importId)))?.isCompleted()).toBe(true);
  }, 60_000);
});

describe("a chunk whose file cannot be read", () => {
  it("is dead-lettered after the last attempt and the import ends partial", async () => {
    const worker = app.get(ChunkProcessor).worker;
    await worker.pause();
    const importId = await startImport();
    await unlink(chunkPath(importId, 1));
    worker.resume();

    const final = await settle(importId);

    expect(final).toMatchObject({
      status: "partial",
      processedRows: 1500,
      failedRows: 0,
      chunks: { pending: 0, done: 2, failed: 1 },
    });
    const chunk = await chunkRow(importId, 1);
    expect(chunk).toMatchObject({ status: "failed", attempts: 2 });
    expect(chunk.error?.message).toContain("ENOENT");

    const original = await chunks.getJob(chunkJobId({ importId, seq: 1 }));
    expect(await original?.isFailed()).toBe(true);
    expect(original?.attemptsMade).toBe(2);
    const letter = await deadLetters.getJob(chunkJobId({ importId, seq: 1 }));
    expect(letter?.data).toEqual({
      importId,
      seq: 1,
      error: expect.stringContaining("ENOENT"),
      invalidRows: [],
    });
    // The rows of the two good chunks are indexed regardless.
    expect(await (await rebuilds.getJob(rebuildJobId(importId)))?.isCompleted()).toBe(true);
  }, 60_000);
});

describe("Bull Board", () => {
  it("serves the queue dashboard at /admin/queues", async () => {
    const response = await api().get("/admin/queues/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });
});
