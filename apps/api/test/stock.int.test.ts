// The supplier price-and-stock fast path over HTTP against the
// docker-compose Postgres, Redis and Elasticsearch (ADR 11). Works on a
// throwaway alias, seeds the small profile itself and boots the whole
// AppModule so the order flow can hold reservations against the parts the
// endpoint patches. Universal parts are used throughout so one search by
// SKU on any variant returns the patched hit.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  OrderResponse,
  SearchHitDto,
  SearchResponse,
  StockUpdateBody,
  StockUpdateResponse,
} from "@passform/contracts";
import { and, asc, eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { generateDataset } from "../scripts/generate.js";
import { runMigrations } from "../scripts/migrate.js";
import { seedDatabase } from "../scripts/seed.js";
import { AppModule } from "../src/app.module.js";
import { closeDb, getDb } from "../src/infra/db/client.js";
import { orders, parts } from "../src/infra/db/schema.js";
import { ReleaseProcessor } from "../src/orders/release.processor.js";
import { aliasName, currentIndexName } from "../src/search/alias.js";
import { closeEsClient, getEsClient } from "../src/search/es.client.js";
import { rebuildIndex } from "../src/search/index-builder.js";

process.env.SEARCH_ALIAS = "parts_stocktest";

const db = getDb();
const es = getEsClient();
let app: INestApplication;
let indexBefore: string | null;

interface SeededPart {
  id: string;
  sku: string;
  priceCents: number;
}
/** Two universal parts of one supplier and one of another. */
let partA: SeededPart;
let partB: SeededPart;
let partOther: SeededPart;
const SUPPLIER = "s_01";
const OTHER_SUPPLIER = "s_02";

const api = (): ReturnType<typeof request> => request(app.getHttpServer());

function patch(supplierId: string, body: StockUpdateBody): request.Test {
  return api().patch(`/suppliers/${supplierId}/stock`).send(body);
}

async function stored(id: string): Promise<{ priceCents: number; stockQty: number }> {
  const [row] = await db
    .select({ priceCents: parts.priceCents, stockQty: parts.stockQty })
    .from(parts)
    .where(eq(parts.id, id));
  if (row === undefined) throw new Error(`part ${id} is missing`);
  return row;
}

async function hitFor(sku: string): Promise<SearchHitDto> {
  const response = await api().get(`/search?variantId=v_000001&q=${encodeURIComponent(sku)}`);
  expect(response.status).toBe(200);
  const body: SearchResponse = response.body;
  const hit = body.hits.find((candidate) => candidate.sku === sku);
  if (hit === undefined) throw new Error(`${sku} is not in the search results`);
  return hit;
}

async function placeOrder(partId: string, qty: number): Promise<OrderResponse> {
  const response = await api()
    .post("/orders")
    .set("Idempotency-Key", randomUUID())
    .send({ lines: [{ partId, qty }] });
  expect(response.status).toBe(201);
  return response.body;
}

async function universalPartsOf(supplierId: string, limit: number): Promise<SeededPart[]> {
  return db
    .select({ id: parts.id, sku: parts.sku, priceCents: parts.priceCents })
    .from(parts)
    .where(and(eq(parts.supplierId, supplierId), eq(parts.universal, true)))
    .orderBy(asc(parts.id))
    .limit(limit);
}

async function dropTestIndices(): Promise<void> {
  const found = await es.cat.indices({ index: `${aliasName()}_v*`, format: "json" });
  for (const row of found)
    if (row.index !== undefined) await es.indices.delete({ index: row.index });
}

beforeAll(async () => {
  await dropTestIndices();
  await runMigrations();
  const dir = await mkdtemp(join(tmpdir(), "passform-stock-"));
  try {
    await generateDataset({ profile: "small", out: dir });
    await seedDatabase({ from: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await rebuildIndex();
  indexBefore = await currentIndexName();

  const [a, b] = await universalPartsOf(SUPPLIER, 2);
  const [other] = await universalPartsOf(OTHER_SUPPLIER, 1);
  if (a === undefined || b === undefined || other === undefined) {
    throw new Error("the seed has too few universal parts");
  }
  partA = a;
  partB = b;
  partOther = other;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  // Nothing here expires, but the release worker must not touch the reservations the tests hold.
  await app.get(ReleaseProcessor).worker.pause();
}, 180_000);

beforeEach(async () => {
  await db.execute(sql`truncate ${orders} cascade`);
  for (const part of [partA, partB, partOther]) {
    await db
      .update(parts)
      .set({ priceCents: part.priceCents, stockQty: 10 })
      .where(eq(parts.id, part.id));
  }
});

afterAll(async () => {
  await app.close();
  await dropTestIndices();
  await closeEsClient();
  await closeDb();
});

describe("PATCH /suppliers/:id/stock", () => {
  it("writes price and stock to Postgres and the live alias, with no rebuild, and names the other supplier's SKU as unknown", async () => {
    const response = await patch(SUPPLIER, {
      rows: [
        { sku: partA.sku, priceCents: 12345, stockQty: 7 },
        { sku: partB.sku, stockQty: 0 },
        { sku: partOther.sku, priceCents: 1 },
      ],
    });

    expect(response.status).toBe(200);
    const body: StockUpdateResponse = response.body;
    expect(body).toEqual({ updated: 2, unknown: [partOther.sku], indexed: true });

    expect(await stored(partA.id)).toEqual({ priceCents: 12345, stockQty: 7 });
    expect(await stored(partB.id)).toEqual({ priceCents: partB.priceCents, stockQty: 0 });
    expect(await stored(partOther.id)).toEqual({ priceCents: partOther.priceCents, stockQty: 10 });

    expect(await hitFor(partA.sku)).toMatchObject({ priceCents: 12345, inStock: true });
    expect(await hitFor(partB.sku)).toMatchObject({ priceCents: partB.priceCents, inStock: false });
    expect(await currentIndexName()).toBe(indexBefore);
  });

  it("stores the reported stock less the units an open reservation will give back", async () => {
    await placeOrder(partA.id, 2);
    expect((await stored(partA.id)).stockQty).toBe(8);

    const response = await patch(SUPPLIER, { rows: [{ sku: partA.sku, stockQty: 5 }] });

    expect(response.body).toEqual({ updated: 1, unknown: [], indexed: true });
    expect((await stored(partA.id)).stockQty).toBe(3);
    expect((await hitFor(partA.sku)).inStock).toBe(true);
  });

  it("does not subtract a confirmed order's reservation", async () => {
    const order = await placeOrder(partB.id, 2);
    const confirmed = await api().post(`/orders/${order.id}/confirm`);
    expect(confirmed.status).toBe(200);

    await patch(SUPPLIER, { rows: [{ sku: partB.sku, stockQty: 5 }] });

    expect((await stored(partB.id)).stockQty).toBe(5);
  });

  it("leaves the same Postgres state when the same body arrives twice", async () => {
    await placeOrder(partA.id, 1);
    const body: StockUpdateBody = {
      rows: [
        { sku: partA.sku, priceCents: 999, stockQty: 4 },
        { sku: partB.sku, priceCents: 1999 },
      ],
    };

    const first = await patch(SUPPLIER, body);
    const afterFirst = [await stored(partA.id), await stored(partB.id)];
    const second = await patch(SUPPLIER, body);
    const afterSecond = [await stored(partA.id), await stored(partB.id)];

    expect(first.body).toEqual(second.body);
    expect(afterFirst).toEqual([
      { priceCents: 999, stockQty: 3 },
      { priceCents: 1999, stockQty: 10 },
    ]);
    expect(afterSecond).toEqual(afterFirst);
  });

  it("answers 404 for an unknown supplier and changes nothing", async () => {
    const response = await patch("s_99", { rows: [{ sku: partA.sku, stockQty: 0 }] });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ statusCode: 404, message: "supplier s_99 not found" });
    expect((await stored(partA.id)).stockQty).toBe(10);
  });
});
