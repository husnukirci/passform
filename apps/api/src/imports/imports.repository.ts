// Everything the import pipeline writes to Postgres. The chunk transaction
// lives here so the processor can stay a load → domain → persist pipeline,
// and so the chunk's own status row is committed with the rows it wrote: a
// crash can never leave parts written and the chunk `pending` (ADR 8).

import { Inject, Injectable } from "@nestjs/common";
import type { ChunkRange, ImportRow } from "@passform/domain";
import { and, count, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { type FitmentInsert, fitmentToRow, partToRow } from "../infra/db/mappers.js";
import {
  categories,
  type ChunkReport,
  fitments,
  type ImportError,
  importChunks,
  imports,
  type InvalidRow,
  parts,
  suppliers,
  vehicleVariants,
} from "../infra/db/schema.js";
import type { KnownReferences } from "./rows.js";

export type ImportStatus = (typeof imports.$inferSelect)["status"];
export type ChunkStatus = (typeof importChunks.$inferSelect)["status"];

export interface ChunkOutcomes {
  pending: number;
  done: number;
  failed: number;
}

export interface ImportSummary {
  id: string;
  supplierId: string;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  chunks: ChunkOutcomes;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: ImportError | null;
}

export interface ChunkRecord {
  importId: string;
  seq: number;
  status: ChunkStatus;
  attempts: number;
  rowFrom: number;
  rowTo: number;
  /** The import's supplier, which every part the chunk upserts belongs to. */
  supplierId: string;
  report: ChunkReport | null;
}

export interface ApplyChunkInput {
  importId: string;
  seq: number;
  supplierId: string;
  rows: ImportRow[];
  accepted: number;
  invalid: InvalidRow[];
}

/** A report keeps this many rejected rows verbatim; the count carries the rest. */
export const REPORTED_ROWS = 100;

export function chunkReport(message: string | null, invalid: readonly InvalidRow[]): ChunkReport {
  return {
    message,
    invalidRowCount: invalid.length,
    invalidRows: invalid.slice(0, REPORTED_ROWS),
  };
}

/**
 * A SKU new to the catalogue gets a deterministic id derived from it, so a
 * retried or re-run chunk mints the same id and never a second part.
 */
export function newPartId(sku: string): string {
  return `p_${sku}`;
}

const PARTS_BATCH = 1_000;
const FITMENTS_BATCH = 5_000;

/** `excluded.<column>` for an `ON CONFLICT DO UPDATE` clause. */
function excluded(column: PgColumn): SQL {
  return sql.raw(`excluded."${column.name}"`);
}

/** Every part column an import may change; `id` and `sku` identify the row and stay. */
const MUTABLE_PART_COLUMNS = {
  brand: excluded(parts.brand),
  brandTier: excluded(parts.brandTier),
  categoryId: excluded(parts.categoryId),
  name: excluded(parts.name),
  oeRef: excluded(parts.oeRef),
  attributes: excluded(parts.attributes),
  priceCents: excluded(parts.priceCents),
  stockQty: excluded(parts.stockQty),
  supplierId: excluded(parts.supplierId),
  universal: excluded(parts.universal),
};

@Injectable()
export class ImportsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async supplierExists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, id));
    return row !== undefined;
  }

  async create(input: {
    id: string;
    supplierId: string;
    filePath: string;
    chunkSize: number;
  }): Promise<void> {
    await this.db.insert(imports).values({ ...input, status: "queued", totalRows: 0 });
  }

  /** Records the split: the row total and one `pending` chunk per range. */
  async addChunks(importId: string, totalRows: number, ranges: ChunkRange[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(imports).set({ totalRows }).where(eq(imports.id, importId));
      if (ranges.length === 0) return;
      await tx
        .insert(importChunks)
        .values(ranges.map((range) => ({ importId, status: "pending" as const, ...range })));
    });
  }

  async start(importId: string): Promise<void> {
    await this.db
      .update(imports)
      .set({ status: "running", startedAt: sql`now()` })
      .where(and(eq(imports.id, importId), eq(imports.status, "queued")));
  }

  /** Moves a live import to a terminal status once; a second caller changes nothing. */
  async finish(
    importId: string,
    status: "completed" | "partial" | "failed",
    error: ImportError | null = null,
  ): Promise<void> {
    await this.db
      .update(imports)
      .set({ status, finishedAt: sql`now()`, error })
      .where(and(eq(imports.id, importId), inArray(imports.status, ["queued", "running"])));
  }

  async setError(importId: string, error: ImportError): Promise<void> {
    await this.db.update(imports).set({ error }).where(eq(imports.id, importId));
  }

  async summary(importId: string): Promise<ImportSummary | null> {
    const [row] = await this.db.select().from(imports).where(eq(imports.id, importId));
    if (row === undefined) return null;
    return {
      id: row.id,
      supplierId: row.supplierId,
      status: row.status,
      totalRows: row.totalRows,
      processedRows: row.processedRows,
      failedRows: row.failedRows,
      chunks: await this.chunkOutcomes(importId),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      error: row.error ?? null,
    };
  }

  async chunkOutcomes(importId: string): Promise<ChunkOutcomes> {
    const rows = await this.db
      .select({ status: importChunks.status, n: count() })
      .from(importChunks)
      .where(eq(importChunks.importId, importId))
      .groupBy(importChunks.status);
    const outcomes: ChunkOutcomes = { pending: 0, done: 0, failed: 0 };
    for (const { status, n } of rows) outcomes[status] = n;
    return outcomes;
  }

  async chunk(importId: string, seq: number): Promise<ChunkRecord | null> {
    const [row] = await this.db
      .select({ chunk: importChunks, supplierId: imports.supplierId })
      .from(importChunks)
      .innerJoin(imports, eq(imports.id, importChunks.importId))
      .where(and(eq(importChunks.importId, importId), eq(importChunks.seq, seq)));
    if (row === undefined) return null;
    const { chunk, supplierId } = row;
    return {
      importId: chunk.importId,
      seq: chunk.seq,
      status: chunk.status,
      attempts: chunk.attempts,
      rowFrom: chunk.rowFrom,
      rowTo: chunk.rowTo,
      supplierId,
      report: chunk.error ?? null,
    };
  }

  /** Which of the referenced categories and variants exist, from one query each. */
  async knownReferences(refs: {
    categorySlugs: string[];
    variantIds: string[];
  }): Promise<KnownReferences> {
    const [categoryRows, variantRows] = await Promise.all([
      refs.categorySlugs.length === 0
        ? []
        : this.db
            .select({ id: categories.id })
            .from(categories)
            .where(inArray(categories.id, refs.categorySlugs)),
      refs.variantIds.length === 0
        ? []
        : this.db
            .select({ id: vehicleVariants.id })
            .from(vehicleVariants)
            .where(inArray(vehicleVariants.id, refs.variantIds)),
    ]);
    return {
      categories: new Set(categoryRows.map((row) => row.id)),
      variants: new Set(variantRows.map((row) => row.id)),
    };
  }

  /**
   * The chunk transaction: upsert the parts on `sku`, replace their
   * fitments, add to the import's counters and mark the chunk `done`, all or
   * nothing.
   */
  async applyChunk({
    importId,
    seq,
    supplierId,
    rows,
    accepted,
    invalid,
  }: ApplyChunkInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const idBySku = new Map<string, string>();
      for (const batch of batches(rows, PARTS_BATCH)) {
        const returned = await tx
          .insert(parts)
          .values(batch.map((row) => partToRow({ ...row, id: newPartId(row.sku), supplierId })))
          .onConflictDoUpdate({ target: parts.sku, set: MUTABLE_PART_COLUMNS })
          .returning({ id: parts.id, sku: parts.sku });
        for (const { id, sku } of returned) idBySku.set(sku, id);
      }

      const partIds = [...idBySku.values()];
      if (partIds.length > 0) await tx.delete(fitments).where(inArray(fitments.partId, partIds));

      const fitmentRows: FitmentInsert[] = [];
      for (const row of rows) {
        const partId = idBySku.get(row.sku);
        if (partId === undefined) throw new Error(`upsert returned no id for sku ${row.sku}`);
        for (const fitment of row.fitments) fitmentRows.push(fitmentToRow(partId, fitment));
      }
      for (const batch of batches(fitmentRows, FITMENTS_BATCH))
        await tx.insert(fitments).values(batch);

      await tx
        .update(imports)
        .set({
          processedRows: sql`${imports.processedRows} + ${accepted}`,
          failedRows: sql`${imports.failedRows} + ${invalid.length}`,
        })
        .where(eq(imports.id, importId));
      await tx
        .update(importChunks)
        .set({
          status: "done",
          attempts: sql`${importChunks.attempts} + 1`,
          error: invalid.length === 0 ? null : chunkReport(null, invalid),
        })
        .where(and(eq(importChunks.importId, importId), eq(importChunks.seq, seq)));
    });
  }

  /** Outside any transaction, so the count survives the rollback that caused it. */
  async recordChunkFailure(importId: string, seq: number, report: ChunkReport): Promise<void> {
    await this.db
      .update(importChunks)
      .set({ attempts: sql`${importChunks.attempts} + 1`, error: report })
      .where(and(eq(importChunks.importId, importId), eq(importChunks.seq, seq)));
  }

  async markChunkFailed(importId: string, seq: number): Promise<void> {
    await this.db
      .update(importChunks)
      .set({ status: "failed" })
      .where(and(eq(importChunks.importId, importId), eq(importChunks.seq, seq)));
  }
}

function* batches<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
