import { Inject, Injectable } from "@nestjs/common";
import type { StockUpdateBody } from "@passform/contracts";
import { availableStock, type Fitment, type Part } from "@passform/domain";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { rowToFitment, rowToPart } from "../infra/db/mappers.js";
import { fitments, orders, parts, stockReservations } from "../infra/db/schema.js";

export interface PartRecord {
  part: Part;
  /** Every ancestor slug plus the leaf, root first. */
  categoryPath: string[];
  fitments: Fitment[];
}

export type StockUpdateRow = StockUpdateBody["rows"][number];

export interface PartValues {
  priceCents: number;
  stockQty: number;
}

export interface AppliedStock extends PartValues {
  id: string;
}

export interface StockUpdateResult {
  /** In request order, one per row whose SKU belongs to the supplier. */
  applied: AppliedStock[];
  /** SKUs that do not exist or belong to another supplier, in request order. */
  unknown: string[];
}

/**
 * What one row of a supplier's delta writes: a field the row does not carry
 * keeps its current value, and a reported stock is reduced by the units open
 * reservations will give back (ADR 11). The whole decision is here, in
 * TypeScript, so the SQL below is a plain UPDATE with both values explicit.
 */
export function nextPartValues(
  row: StockUpdateRow,
  current: PartValues,
  openReservedUnits: number,
): PartValues {
  return {
    priceCents: row.priceCents ?? current.priceCents,
    stockQty:
      row.stockQty === undefined
        ? current.stockQty
        : availableStock(row.stockQty, openReservedUnits),
  };
}

@Injectable()
export class PartsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findBySku(sku: string): Promise<PartRecord | null> {
    const [row] = await this.db.select().from(parts).where(eq(parts.sku, sku));
    if (row === undefined) return null;
    const part = rowToPart(row);

    const [rows, categoryPath] = await Promise.all([
      this.db.select().from(fitments).where(eq(fitments.partId, part.id)).orderBy(asc(fitments.id)),
      this.categoryPath(part.categorySlug),
    ]);
    return { part, categoryPath, fitments: rows.map(rowToFitment) };
  }

  /**
   * The fast index path's Postgres half (ADR 11), in one transaction. The
   * first statement locks the supplier's matching rows so the delta
   * serialises against the order transaction, which locks the same rows
   * through its conditional update; then the open reservation units per
   * part are summed and every row is written with both values explicit.
   */
  async applyStockUpdate(supplierId: string, rows: StockUpdateRow[]): Promise<StockUpdateResult> {
    return this.db.transaction(async (tx) => {
      const locked = await tx
        .select({
          id: parts.id,
          sku: parts.sku,
          priceCents: parts.priceCents,
          stockQty: parts.stockQty,
        })
        .from(parts)
        .where(
          and(
            eq(parts.supplierId, supplierId),
            inArray(
              parts.sku,
              rows.map((row) => row.sku),
            ),
          ),
        )
        .for("update");
      const bySku = new Map(locked.map((part) => [part.sku, part]));
      const reserved = await this.openReservedUnits(
        tx,
        locked.map((part) => part.id),
      );

      const applied: AppliedStock[] = [];
      const unknown: string[] = [];
      for (const row of rows) {
        const part = bySku.get(row.sku);
        if (part === undefined) {
          unknown.push(row.sku);
          continue;
        }
        const values = nextPartValues(row, part, reserved.get(part.id) ?? 0);
        await tx.update(parts).set(values).where(eq(parts.id, part.id));
        applied.push({ id: part.id, ...values });
      }
      return { applied, unknown };
    });
  }

  /**
   * Units held by reservations that can still come back: unreleased rows of
   * `placed` orders. `confirmed` is excluded here, in SQL, because a
   * confirmed order keeps its stock for good (ADR 10).
   */
  private async openReservedUnits(db: Db, partIds: string[]): Promise<Map<string, number>> {
    if (partIds.length === 0) return new Map();
    const rows = await db
      .select({
        partId: stockReservations.partId,
        units: sql<number>`sum(${stockReservations.qty})::int`,
      })
      .from(stockReservations)
      .innerJoin(orders, eq(orders.id, stockReservations.orderId))
      .where(
        and(
          inArray(stockReservations.partId, partIds),
          isNull(stockReservations.releasedAt),
          eq(orders.status, "placed"),
        ),
      )
      .groupBy(stockReservations.partId);
    return new Map(rows.map((row) => [row.partId, row.units]));
  }

  /** Walks `parent_id` up to the root in one recursive query. */
  private async categoryPath(leaf: string): Promise<string[]> {
    const result = await this.db.execute<{ id: string }>(sql`
      with recursive path as (
        select id, parent_id, 0 as depth from categories where id = ${leaf}
        union all
        select c.id, c.parent_id, path.depth + 1 from categories c join path on c.id = path.parent_id
      )
      select id from path order by depth desc`);
    return result.rows.map((row) => row.id);
  }
}
