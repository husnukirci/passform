// The order flow over HTTP against the docker-compose Postgres and Redis:
// idempotent creation, the two races, expiry through the release job and
// confirmation. Seeds the small profile itself, boots the whole AppModule
// (the wiring check for the orders module and its queue) and runs the
// release processor by hand with its worker paused, so every release is
// one the test asked for.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getQueueToken } from "@nestjs/bullmq";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CreateOrderBody, OrderErrorResponse, OrderResponse } from "@passform/contracts";
import type { Queue } from "bullmq";
import { asc, eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { generateDataset } from "../scripts/generate.js";
import { runMigrations } from "../scripts/migrate.js";
import { seedDatabase } from "../scripts/seed.js";
import { AppModule } from "../src/app.module.js";
import { closeDb, getDb } from "../src/infra/db/client.js";
import { orders, parts, stockReservations } from "../src/infra/db/schema.js";
import { RESERVATIONS_RELEASE } from "../src/infra/queues.js";
import { ReleaseProcessor } from "../src/orders/release.processor.js";

const db = getDb();
let app: INestApplication;
let release: ReleaseProcessor;
/** Two seeded parts the tests set the stock of explicitly. */
let partA: { id: string; sku: string; priceCents: number };
let partB: { id: string; sku: string; priceCents: number };

const api = (): ReturnType<typeof request> => request(app.getHttpServer());

function place(key: string, body: CreateOrderBody): request.Test {
  return api().post("/orders").set("Idempotency-Key", key).send(body);
}

async function stockOf(id: string): Promise<number> {
  const [row] = await db.select({ stockQty: parts.stockQty }).from(parts).where(eq(parts.id, id));
  if (row === undefined) throw new Error(`part ${id} is missing`);
  return row.stockQty;
}

async function setStock(id: string, stockQty: number): Promise<void> {
  await db.update(parts).set({ stockQty }).where(eq(parts.id, id));
}

async function orderRow(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  if (row === undefined) throw new Error(`order ${id} is missing`);
  return row;
}

async function reservationsOf(orderId: string) {
  return db
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.orderId, orderId))
    .orderBy(asc(stockReservations.id));
}

async function expireReservations(orderId: string): Promise<void> {
  await db
    .update(stockReservations)
    .set({ expiresAt: sql`now() - interval '1 second'` })
    .where(eq(stockReservations.orderId, orderId));
}

async function placed(body: CreateOrderBody = { lines: [{ partId: partA.id, qty: 1 }] }) {
  const response = await place(randomUUID(), body);
  expect(response.status).toBe(201);
  const order: OrderResponse = response.body;
  return order;
}

beforeAll(async () => {
  await runMigrations();
  const dir = await mkdtemp(join(tmpdir(), "passform-orders-"));
  try {
    await generateDataset({ profile: "small", out: dir });
    await seedDatabase({ from: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const [a, b] = await db
    .select({ id: parts.id, sku: parts.sku, priceCents: parts.priceCents })
    .from(parts)
    .orderBy(asc(parts.id))
    .limit(2);
  if (a === undefined || b === undefined) throw new Error("the seed has fewer than two parts");
  partA = a;
  partB = b;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  // The two races fire ten requests at once; each supertest call listens on the server.
  app.getHttpServer().setMaxListeners(20);
  release = app.get(ReleaseProcessor);
  await release.worker.pause();
}, 180_000);

beforeEach(async () => {
  await db.execute(sql`truncate ${orders} cascade`);
  await setStock(partA.id, 10);
  await setStock(partB.id, 10);
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("POST /orders", () => {
  it("creates the order, takes the stock, reserves it and GET returns it", async () => {
    const body = {
      lines: [
        { partId: partA.id, qty: 2 },
        { partId: partB.id, qty: 3 },
      ],
    };
    const before = Date.now();

    const response = await place(randomUUID(), body);

    expect(response.status).toBe(201);
    const order: OrderResponse = response.body;
    expect(order).toMatchObject({
      status: "placed",
      totalCents: 2 * partA.priceCents + 3 * partB.priceCents,
      lines: [
        { partId: partA.id, sku: partA.sku, qty: 2, unitCents: partA.priceCents },
        { partId: partB.id, sku: partB.sku, qty: 3, unitCents: partB.priceCents },
      ],
      confirmedAt: null,
    });
    expect(order.id).toMatch(/^ord_[0-9a-f]{12}$/);
    const expiresIn = new Date(order.expiresAt).getTime() - before;
    expect(expiresIn).toBeGreaterThan(14 * 60_000);
    expect(expiresIn).toBeLessThanOrEqual(15 * 60_000 + 1_000);

    expect(await stockOf(partA.id)).toBe(8);
    expect(await stockOf(partB.id)).toBe(7);
    expect(await reservationsOf(order.id)).toMatchObject([
      { partId: partA.id, qty: 2, releasedAt: null },
      { partId: partB.id, qty: 3, releasedAt: null },
    ]);
    expect((await orderRow(order.id)).response).toEqual(order);

    const fetched = await api().get(`/orders/${order.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(order);
  });

  it("replays the same key and body as 200 with a byte-identical body, taking the stock once", async () => {
    const key = randomUUID();
    const body = { lines: [{ partId: partA.id, qty: 2 }] };

    const first = await place(key, body);
    const second = await place(key, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.text).toBe(first.text);
    expect(await stockOf(partA.id)).toBe(8);
    expect(await db.select({ id: orders.id }).from(orders)).toHaveLength(1);
  });

  it("answers 409 when the same key arrives with a different body", async () => {
    const key = randomUUID();
    await place(key, { lines: [{ partId: partA.id, qty: 2 }] });

    const response = await place(key, { lines: [{ partId: partA.id, qty: 3 }] });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      statusCode: 409,
      message: "Idempotency-Key reused with a different payload",
    });
    expect(await stockOf(partA.id)).toBe(8);
  });

  it("serialises ten identical concurrent requests into one order: one 201, nine 200", async () => {
    const key = randomUUID();
    const body = { lines: [{ partId: partA.id, qty: 1 }] };

    const responses = await Promise.all(Array.from({ length: 10 }, () => place(key, body)));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
    const bodies = new Set(responses.map((response) => response.text));
    expect(bodies.size).toBe(1);
    expect(await db.select({ id: orders.id }).from(orders)).toHaveLength(1);
    expect(await stockOf(partA.id)).toBe(9);
  });

  it("gives the last unit to exactly one of ten racing buyers and names the sku to the rest", async () => {
    await setStock(partA.id, 1);
    const body = { lines: [{ partId: partA.id, qty: 1 }] };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => place(randomUUID(), body)),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    for (const response of responses.filter((response) => response.status === 409)) {
      const error: OrderErrorResponse = response.body;
      expect(error).toEqual({
        statusCode: 409,
        message: `Insufficient stock for ${partA.sku}`,
        sku: partA.sku,
      });
    }
    expect(await stockOf(partA.id)).toBe(0);
    expect(await db.select({ id: orders.id }).from(orders)).toHaveLength(1);
  });
});

describe("reservations.release", () => {
  it("expires a placed order past its expiry, gives the stock back, and confirm then answers 409", async () => {
    const order = await placed({ lines: [{ partId: partA.id, qty: 4 }] });
    expect(await stockOf(partA.id)).toBe(6);
    await expireReservations(order.id);

    expect(await release.process()).toEqual({ orders: 1, reservations: 1 });

    expect((await orderRow(order.id)).status).toBe("expired");
    expect(await stockOf(partA.id)).toBe(10);
    const [reservation] = await reservationsOf(order.id);
    expect(reservation?.releasedAt).toBeInstanceOf(Date);

    const confirm = await api().post(`/orders/${order.id}/confirm`);
    expect(confirm.status).toBe(409);
    expect(confirm.body).toEqual({ statusCode: 409, message: "Order has expired" });

    // A second run finds nothing: the release is not repeated.
    expect(await release.process()).toEqual({ orders: 0, reservations: 0 });
    expect(await stockOf(partA.id)).toBe(10);
  });

  it("never touches a confirmed order, however long past its expiry", async () => {
    const order = await placed({ lines: [{ partId: partA.id, qty: 4 }] });

    const confirm = await api().post(`/orders/${order.id}/confirm`);
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ id: order.id, status: "confirmed" });
    expect(typeof confirm.body.confirmedAt).toBe("string");
    await expireReservations(order.id);

    expect(await release.process()).toEqual({ orders: 0, reservations: 0 });

    expect((await orderRow(order.id)).status).toBe("confirmed");
    expect(await stockOf(partA.id)).toBe(6);
    const [reservation] = await reservationsOf(order.id);
    expect(reservation?.releasedAt).toBeNull();
    // Confirming again is a 200 with the same confirmation, not an error.
    const again = await api().post(`/orders/${order.id}/confirm`);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({
      status: "confirmed",
      confirmedAt: confirm.body.confirmedAt,
    });
  });

  it("is registered once as a repeatable job when the app boots", async () => {
    const queue: Queue = app.get(getQueueToken(RESERVATIONS_RELEASE));

    const schedulers = await queue.getJobSchedulers();

    expect(schedulers.map((scheduler) => scheduler.key)).toEqual([RESERVATIONS_RELEASE]);
    expect(schedulers[0]?.every).toBe(60_000);
  });
});

describe("GET /orders/:id and POST /orders/:id/confirm", () => {
  it("answer 404 for an order that does not exist", async () => {
    expect((await api().get("/orders/ord_nope")).status).toBe(404);
    expect((await api().post("/orders/ord_nope/confirm")).status).toBe(404);
  });
});
