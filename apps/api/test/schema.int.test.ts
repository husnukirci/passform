// Schema and seeding against the docker-compose Postgres. Runs alone in its
// file (integration files are sequential) and starts from an empty
// database, so it also proves the committed migrations apply from nothing.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateDataset } from "../scripts/generate.js";
import { runMigrations } from "../scripts/migrate.js";
import { seedDatabase } from "../scripts/seed.js";
import { closeDb, getDb } from "../src/infra/db/client.js";
import { categories, orders, parts, suppliers, vehicleVariants } from "../src/infra/db/schema.js";

const db = getDb();

async function count(table: string): Promise<number> {
  const result = await db.execute<{ n: string }>(
    sql.raw(`select count(*)::text as n from ${table}`),
  );
  return Number(result.rows[0]?.n);
}

beforeAll(async () => {
  // Empty database: drop everything the migrations and the migrator create.
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
});

describe("migrations", () => {
  it("apply on an empty database and create every table", async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "categories",
      "fitments",
      "import_chunks",
      "imports",
      "order_lines",
      "orders",
      "parts",
      "stock_reservations",
      "suppliers",
      "vehicle_variants",
    ]);
  });

  it("are a no-op when applied again", async () => {
    await expect(runMigrations()).resolves.toBeUndefined();
  });
});

describe("generate small then seed", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "passform-seed-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips the row counts", async () => {
    const generated = await generateDataset({ profile: "small", out: dir });
    const seeded = await seedDatabase({ from: dir });

    expect(seeded).toEqual({
      categories: generated.categories,
      suppliers: generated.suppliers,
      variants: generated.variants,
      parts: generated.parts,
      fitments: generated.fitments,
    });
    expect(await count("vehicle_variants")).toBe(2000);
    expect(await count("parts")).toBe(5000);
    expect(await count("fitments")).toBe(generated.fitments);
    expect(await count("categories")).toBe(generated.categories);
    expect(await count("suppliers")).toBe(6);
  });

  it("is repeatable: seeding again replaces rather than duplicates", async () => {
    await seedDatabase({ from: dir });
    expect(await count("parts")).toBe(5000);
  });
});

describe("constraints", () => {
  it("lets two variants share a registration key", async () => {
    const shared = {
      make: "Varenta",
      model: "Kestra",
      engineCode: "D16-77",
      kw: 77,
      fuel: "diesel" as const,
      buildFrom: "2014-03",
      buildTo: null,
      equipment: [],
      keyManufacturer: "9999",
      keyType: "ZZ1",
    };
    await db.insert(vehicleVariants).values([
      { id: "v_test_a", ...shared },
      { id: "v_test_b", ...shared, engineCode: "D16-88", kw: 88 },
    ]);

    const rows = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from vehicle_variants where key_manufacturer = '9999' and key_type = 'ZZ1'`,
    );
    expect(Number(rows.rows[0]?.n)).toBe(2);
  });

  it("rejects a negative stock quantity", async () => {
    await db.insert(categories).values({ id: "test/leaf", name: "Test leaf", parentId: null });
    await db.insert(suppliers).values({ id: "s_test", name: "Test supplier" });
    await expect(
      db.insert(parts).values({
        id: "p_test_neg",
        sku: "TEST-NEG",
        brand: "Torbenna",
        brandTier: "oe",
        categoryId: "test/leaf",
        name: "Negative stock",
        oeRef: "",
        attributes: {},
        priceCents: 100,
        stockQty: -1,
        supplierId: "s_test",
        universal: false,
      }),
    ).rejects.toMatchObject({ cause: { constraint: "parts_stock_qty_check" } });
  });

  it("keeps the order idempotency key unique", async () => {
    const order = {
      idempotencyKey: "0f2c8b6a-1111-4222-8333-444455556666",
      payloadHash: "abc",
      status: "placed" as const,
      totalCents: 100,
    };
    await db.insert(orders).values({ id: "o_test_a", ...order });
    await expect(db.insert(orders).values({ id: "o_test_b", ...order })).rejects.toMatchObject({
      cause: { constraint: "orders_idempotency_key_unique" },
    });
  });
});
