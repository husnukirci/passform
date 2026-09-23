// Everything the order flow writes to Postgres. The creation transaction
// lives here in full: the advisory lock that serialises one idempotency
// key, the stored-response replay (ADR 9), the conditional stock update and
// the reservation rows (ADR 10). The service maps outcomes to HTTP; it
// never sees a half-finished order.

import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { OrderResponse } from "@passform/contracts";
import { type OrderLineInput, orderTotalCents, reservationExpiresAt } from "@passform/domain";
import { and, asc, eq, gte, inArray, min, sql } from "drizzle-orm";
import pg from "pg";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { orderLines, orders, parts, stockReservations } from "../infra/db/schema.js";

export type CreateOrderOutcome =
  | { kind: "created"; order: OrderResponse }
  | { kind: "replayed"; response: OrderResponse }
  | { kind: "conflict" }
  | { kind: "out_of_stock"; sku: string };

export interface CreateOrderInput {
  key: string;
  payloadHash: string;
  lines: OrderLineInput[];
}

/** What the service needs from a part to price a line. */
export interface PartPrice {
  id: string;
  sku: string;
  priceCents: number;
}

export interface ReleaseResult {
  /** `placed` orders moved to `expired`. */
  orders: number;
  /** Reservations released, one per line of those orders. */
  reservations: number;
}

/** The unique index on `idempotency_key`, the backstop behind the advisory lock. */
const IDEMPOTENCY_KEY_CONSTRAINT = "orders_idempotency_key_unique";

export function newOrderId(): string {
  return `ord_${randomBytes(6).toString("hex")}`;
}

/** Thrown inside the transaction to roll it back; caught and turned into an outcome. */
class OutOfStock extends Error {
  constructor(readonly sku: string) {
    super(`insufficient stock for ${sku}`);
  }
}

@Injectable()
export class OrdersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async partPrices(ids: string[]): Promise<PartPrice[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: parts.id, sku: parts.sku, priceCents: parts.priceCents })
      .from(parts)
      .where(inArray(parts.id, ids));
  }

  /**
   * One transaction: lock the key, replay or reject a key already used,
   * otherwise insert the order, take the stock conditionally per line,
   * reserve it, and store the response that every replay returns.
   */
  async createOrder(input: CreateOrderInput): Promise<CreateOrderOutcome> {
    try {
      return await this.db.transaction((tx) => this.createOrderIn(tx, input));
    } catch (error) {
      if (error instanceof OutOfStock) return { kind: "out_of_stock", sku: error.sku };
      // A second request with this key committed first despite the lock (a
      // lock lost to a failover, say): the row it wrote is the answer.
      if (isUniqueViolation(error, IDEMPOTENCY_KEY_CONSTRAINT)) {
        const existing = await this.existingOutcome(this.db, input);
        if (existing !== null) return existing;
      }
      throw error;
    }
  }

  private async createOrderIn(tx: Db, input: CreateOrderInput): Promise<CreateOrderOutcome> {
    const { key, payloadHash, lines } = input;
    // First statement: every request carrying this key queues here until the
    // holder commits, so the second one always finds the stored response.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const existing = await this.existingOutcome(tx, input);
    if (existing !== null) return existing;

    const id = newOrderId();
    const now = new Date();
    const expiresAt = reservationExpiresAt(now);
    await tx.insert(orders).values({
      id,
      idempotencyKey: key,
      payloadHash,
      status: "placed",
      totalCents: orderTotalCents(lines),
      createdAt: now,
    });
    await tx
      .insert(orderLines)
      .values(lines.map((line, position) => ({ orderId: id, position, ...line })));

    const responseLines: OrderResponse["lines"] = [];
    for (const line of lines) {
      // The condition is in the WHERE, so two orders racing for the last
      // unit cannot both see it: the row lock serialises them and the
      // loser's predicate re-evaluates to false.
      const [taken] = await tx
        .update(parts)
        .set({ stockQty: sql`${parts.stockQty} - ${line.qty}` })
        .where(and(eq(parts.id, line.partId), gte(parts.stockQty, line.qty)))
        .returning({ sku: parts.sku, name: parts.name });
      if (taken === undefined) throw new OutOfStock(await this.skuOf(tx, line.partId));
      responseLines.push({
        partId: line.partId,
        ...taken,
        qty: line.qty,
        unitCents: line.unitCents,
      });
    }
    await tx
      .insert(stockReservations)
      .values(
        lines.map((line) => ({ orderId: id, partId: line.partId, qty: line.qty, expiresAt })),
      );

    const order: OrderResponse = {
      id,
      status: "placed",
      totalCents: orderTotalCents(lines),
      lines: responseLines,
      expiresAt: expiresAt.toISOString(),
      confirmedAt: null,
    };
    await tx.update(orders).set({ response: order }).where(eq(orders.id, id));
    return { kind: "created", order };
  }

  /** The stored outcome for a key already used, or null when the key is new. */
  private async existingOutcome(
    db: Db,
    { key, payloadHash }: CreateOrderInput,
  ): Promise<CreateOrderOutcome | null> {
    const [row] = await db
      .select({ payloadHash: orders.payloadHash, response: orders.response })
      .from(orders)
      .where(eq(orders.idempotencyKey, key));
    if (row === undefined) return null;
    if (row.payloadHash !== payloadHash) return { kind: "conflict" };
    if (row.response === null) throw new Error(`order for key ${key} has no stored response`);
    return { kind: "replayed", response: row.response };
  }

  private async skuOf(db: Db, partId: string): Promise<string> {
    const [row] = await db.select({ sku: parts.sku }).from(parts).where(eq(parts.id, partId));
    return row?.sku ?? partId;
  }

  /** The order as it is now; the stored response is only for replays. */
  async find(id: string): Promise<OrderResponse | null> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (order === undefined) return null;
    const [lines, [reservation]] = await Promise.all([
      this.db
        .select({
          partId: orderLines.partId,
          sku: parts.sku,
          name: parts.name,
          qty: orderLines.qty,
          unitCents: orderLines.unitCents,
        })
        .from(orderLines)
        .innerJoin(parts, eq(parts.id, orderLines.partId))
        .where(eq(orderLines.orderId, id))
        .orderBy(asc(orderLines.position)),
      this.db
        .select({ expiresAt: min(stockReservations.expiresAt) })
        .from(stockReservations)
        .where(eq(stockReservations.orderId, id)),
    ]);
    const expiresAt = reservation?.expiresAt;
    if (expiresAt === undefined || expiresAt === null) {
      throw new Error(`order ${id} has no reservations`);
    }
    return {
      id: order.id,
      status: order.status,
      totalCents: order.totalCents,
      lines,
      expiresAt: expiresAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
    };
  }

  /** `placed` → `confirmed`, once. False when the order is not `placed` (or not there). */
  async confirm(id: string): Promise<boolean> {
    const confirmed = await this.db
      .update(orders)
      .set({ status: "confirmed", confirmedAt: sql`now()` })
      .where(and(eq(orders.id, id), eq(orders.status, "placed")))
      .returning({ id: orders.id });
    return confirmed.length > 0;
  }

  /**
   * The compensation path (ADR 10): every `placed` order with an open
   * reservation past its expiry becomes `expired`, its reservations are
   * released and their quantities go back on the parts, in one
   * transaction. `confirmed` is excluded by the status predicate, so a
   * confirmation that commits first wins and its stock stays taken.
   */
  async releaseExpired(): Promise<ReleaseResult> {
    return this.db.transaction(async (tx) => {
      const expired = await tx
        .update(orders)
        .set({ status: "expired" })
        .where(
          and(
            eq(orders.status, "placed"),
            inArray(
              orders.id,
              tx
                .select({ orderId: stockReservations.orderId })
                .from(stockReservations)
                .where(
                  and(
                    sql`${stockReservations.releasedAt} is null`,
                    sql`${stockReservations.expiresAt} < now()`,
                  ),
                ),
            ),
          ),
        )
        .returning({ id: orders.id });
      if (expired.length === 0) return { orders: 0, reservations: 0 };

      const released = await tx
        .update(stockReservations)
        .set({ releasedAt: sql`now()` })
        .where(
          and(
            inArray(
              stockReservations.orderId,
              expired.map((row) => row.id),
            ),
            sql`${stockReservations.releasedAt} is null`,
          ),
        )
        .returning({ partId: stockReservations.partId, qty: stockReservations.qty });
      for (const { partId, qty } of released) {
        await tx
          .update(parts)
          .set({ stockQty: sql`${parts.stockQty} + ${qty}` })
          .where(eq(parts.id, partId));
      }
      return { orders: expired.length, reservations: released.length };
    });
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  // Drizzle wraps the driver error as `cause`; the code and constraint are on the inner one.
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
  return (
    cause instanceof pg.DatabaseError && cause.code === "23505" && cause.constraint === constraint
  );
}
