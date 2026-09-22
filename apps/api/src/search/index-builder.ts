// Rebuilds the parts index from Postgres into a fresh physical index and
// swaps the alias only after the document count matches the source (ADR 6).
// Parts stream in batches of 5,000 by keyset on id; each batch's fitments
// are fetched and grouped in memory for that batch only, then indexed in
// bulk requests of 2,000 documents.

import type { Client } from "@elastic/elasticsearch";
import { asc, count, gt, inArray } from "drizzle-orm";

import { type Db, getDb } from "../infra/db/client.js";
import { type FitmentRow, type PartRow, rowToFitment, rowToPart } from "../infra/db/mappers.js";
import { categories, fitments, parts } from "../infra/db/schema.js";
import { deleteIndex, nextIndexName, swapAlias } from "./alias.js";
import { type PartDocument, partToDocument } from "./documents.js";
import { getEsClient } from "./es.client.js";
import { PARTS_MAPPING, PARTS_SETTINGS_FOR_LOAD, PARTS_SETTINGS_FOR_SERVING } from "./mapping.js";

export const PARTS_BATCH_SIZE = 5_000;
export const BULK_CHUNK_SIZE = 2_000;

export interface RebuildOptions {
  db?: Db;
  es?: Client;
  /** The source-of-truth count the index is verified against. Overridable for tests. */
  countSource?: (db: Db) => Promise<number>;
  log?: (message: string) => void;
}

export interface RebuildResult {
  index: string;
  count: number;
  seconds: number;
  /** The longest `fitments` array indexed; a proxy for the largest document. */
  maxFitments: number;
}

export class IndexVerificationError extends Error {
  constructor(
    readonly index: string,
    readonly expected: number,
    readonly indexed: number,
  ) {
    super(`index ${index} holds ${indexed} documents, Postgres has ${expected} parts`);
    this.name = "IndexVerificationError";
  }
}

export async function rebuildIndex({
  db = getDb(),
  es = getEsClient(),
  countSource = countParts,
  log = () => undefined,
}: RebuildOptions = {}): Promise<RebuildResult> {
  const started = performance.now();
  const index = nextIndexName();
  await es.indices.create({
    index,
    settings: PARTS_SETTINGS_FOR_LOAD,
    mappings: PARTS_MAPPING,
  });
  log(`created ${index}`);

  try {
    const categoryPaths = await loadCategoryPaths(db);
    let indexed = 0;
    let maxFitments = 0;

    for await (const batch of partBatches(db)) {
      const fitmentsByPart = await loadFitments(
        db,
        batch.map((row) => row.id),
      );
      const documents = batch.map((row) => {
        const part = rowToPart(row);
        const path = categoryPaths.get(part.categorySlug);
        if (path === undefined)
          throw new Error(`part ${part.id}: unknown category ${part.categorySlug}`);
        const rows = (fitmentsByPart.get(part.id) ?? []).map(rowToFitment);
        maxFitments = Math.max(maxFitments, rows.length);
        return { id: part.id, document: partToDocument(part, path, rows) };
      });

      for (const chunk of chunks(documents, BULK_CHUNK_SIZE)) {
        await bulkIndex(es, index, chunk);
      }
      indexed += documents.length;
      log(`indexed ${indexed}`);
    }

    await es.indices.refresh({ index });
    const [{ count: inIndex }, expected] = await Promise.all([
      es.count({ index }),
      countSource(db),
    ]);
    if (inIndex !== expected) throw new IndexVerificationError(index, expected, inIndex);

    await es.indices.putSettings({ index, settings: PARTS_SETTINGS_FOR_SERVING });
    const { from } = await swapAlias(index, es);
    if (from !== null) await deleteIndex(from, es);

    const seconds = (performance.now() - started) / 1000;
    log(
      `${index}: ${inIndex} documents, largest fitments array ${maxFitments}, ${seconds.toFixed(1)}s`,
    );
    return { index, count: inIndex, seconds, maxFitments };
  } catch (error) {
    // The alias never moved; nothing reads the half-built index, so drop it.
    await deleteIndex(index, es).catch(() => undefined);
    throw error;
  }
}

export async function countParts(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(parts);
  return row?.n ?? 0;
}

/** Every category's ancestors plus itself, keyed by slug, from one query. */
async function loadCategoryPaths(db: Db): Promise<Map<string, string[]>> {
  const rows = await db.select().from(categories);
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const paths = new Map<string, string[]>();
  for (const { id } of rows) {
    const path: string[] = [];
    for (let slug: string | null = id; slug !== null; slug = parentOf.get(slug) ?? null) {
      path.unshift(slug);
    }
    paths.set(id, path);
  }
  return paths;
}

async function* partBatches(db: Db): AsyncGenerator<PartRow[]> {
  let after = "";
  for (;;) {
    const batch = await db
      .select()
      .from(parts)
      .where(gt(parts.id, after))
      .orderBy(asc(parts.id))
      .limit(PARTS_BATCH_SIZE);
    const last = batch.at(-1);
    if (last === undefined) return;
    yield batch;
    after = last.id;
  }
}

async function loadFitments(db: Db, partIds: string[]): Promise<Map<string, FitmentRow[]>> {
  const rows = await db.select().from(fitments).where(inArray(fitments.partId, partIds));
  const byPart = new Map<string, FitmentRow[]>();
  for (const row of rows) {
    const list = byPart.get(row.partId);
    if (list === undefined) byPart.set(row.partId, [row]);
    else list.push(row);
  }
  return byPart;
}

async function bulkIndex(
  es: Client,
  index: string,
  documents: { id: string; document: PartDocument }[],
): Promise<void> {
  const response = await es.bulk({
    index,
    operations: documents.flatMap(({ id, document }) => [{ index: { _id: id } }, document]),
  });
  if (!response.errors) return;
  const failed = response.items.find((item) => item.index?.error !== undefined);
  throw new Error(
    `bulk index into ${index} failed: ${JSON.stringify(failed?.index?.error ?? "unknown error")}`,
  );
}

function* chunks<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
