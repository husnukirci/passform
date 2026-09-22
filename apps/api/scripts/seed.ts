// Seeds the catalogue from a generated dataset directory.
//   npm run db:seed -- [--from DIR]   (default $DATA_DIR/small)
// One transaction: truncate the catalogue tables, insert categories and
// suppliers, then COPY variants, parts and fitments from the jsonl files.
// parts.jsonl is read twice (parts, then fitments) so fitments never
// reference a part that is not there yet.

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import type { VehicleVariant } from "@passform/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { from as copyFrom } from "pg-copy-streams";

import { closeDb, getPool } from "../src/infra/db/client.js";
import { fitmentToRow, partToRow, variantToRow } from "../src/infra/db/mappers.js";
import * as schema from "../src/infra/db/schema.js";
import type { Category } from "./categories.js";
import { chunked, csvLine, pgTextArray } from "./csv.js";
import { readJsonl } from "./jsonl.js";
import type { Supplier } from "./names.js";
import { dataDir, userPath } from "./paths.js";
import type { PartLine } from "./synth.js";

export interface SeedOptions {
  from: string;
  /** Called after each table, for progress output. */
  log?: (message: string) => void;
}

export interface SeedResult {
  categories: number;
  suppliers: number;
  variants: number;
  parts: number;
  fitments: number;
}

export async function seedDatabase({
  from,
  log = () => undefined,
}: SeedOptions): Promise<SeedResult> {
  const client = await getPool().connect();
  const db = drizzle(client, { schema });
  const timer = new StepTimer(log);

  try {
    await client.query("BEGIN");

    // Orders and imports hang off the catalogue, so a reseed clears them too.
    await db.execute(
      sql`TRUNCATE ${schema.fitments}, ${schema.parts}, ${schema.vehicleVariants}, ${schema.categories}, ${schema.suppliers} RESTART IDENTITY CASCADE`,
    );

    const categoryList = JSON.parse(
      await readFile(join(from, "categories.json"), "utf8"),
    ) as Category[];
    // File order is parents first, and each batch is inserted in that order.
    for (const batch of batches(categoryList, 500)) {
      await db.insert(schema.categories).values(batch);
    }
    timer.step(`categories: ${categoryList.length}`);

    const supplierList = JSON.parse(
      await readFile(join(from, "suppliers.json"), "utf8"),
    ) as Supplier[];
    await db.insert(schema.suppliers).values(supplierList);
    timer.step(`suppliers: ${supplierList.length}`);

    const variants = await copyInto(
      client,
      "vehicle_variants (id, make, model, engine_code, kw, fuel, build_from, build_to, equipment, key_manufacturer, key_type)",
      variantLines(join(from, "variants.jsonl")),
    );
    timer.step(`vehicle_variants: ${variants}`);

    const parts = await copyInto(
      client,
      "parts (id, sku, brand, brand_tier, category_id, name, oe_ref, attributes, price_cents, stock_qty, supplier_id, universal)",
      partLines(join(from, "parts.jsonl")),
    );
    timer.step(`parts: ${parts}`);

    const fitments = await copyInto(
      client,
      "fitments (part_id, variant_id, build_from, build_to, axle, equipment_code)",
      fitmentLines(join(from, "parts.jsonl")),
    );
    timer.step(`fitments: ${fitments}`);

    await client.query("COMMIT");
    timer.step("commit");
    client.release();

    return {
      categories: categoryList.length,
      suppliers: supplierList.length,
      variants,
      parts,
      fitments,
    };
  } catch (error) {
    // A failed COPY can leave the connection mid-protocol: roll back on a
    // best-effort basis and hand the client back with the error so the pool
    // discards it instead of reusing it.
    await client.query("ROLLBACK").catch(() => undefined);
    client.release(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/** Streams csv `lines` into `target` (a `table (columns)` clause); returns the row count. */
async function copyInto(
  client: pg.PoolClient,
  target: string,
  lines: AsyncIterable<string>,
): Promise<number> {
  const stream = client.query(copyFrom(`COPY ${target} FROM STDIN WITH (FORMAT csv)`));
  await pipeline(Readable.from(chunked(lines)), stream);
  return stream.rowCount ?? 0;
}

async function* variantLines(path: string): AsyncGenerator<string> {
  for await (const variant of readJsonl<VehicleVariant>(path)) {
    const row = variantToRow(variant);
    yield csvLine([
      row.id,
      row.make,
      row.model,
      row.engineCode,
      row.kw,
      row.fuel,
      row.buildFrom,
      row.buildTo,
      pgTextArray(row.equipment),
      row.keyManufacturer,
      row.keyType,
    ]);
  }
}

async function* partLines(path: string): AsyncGenerator<string> {
  for await (const line of readJsonl<PartLine>(path)) {
    const { fitments: _fitments, ...part } = line;
    const row = partToRow(part);
    yield csvLine([
      row.id,
      row.sku,
      row.brand,
      row.brandTier,
      row.categoryId,
      row.name,
      row.oeRef,
      JSON.stringify(row.attributes),
      row.priceCents,
      row.stockQty,
      row.supplierId,
      row.universal,
    ]);
  }
}

async function* fitmentLines(path: string): AsyncGenerator<string> {
  for await (const line of readJsonl<PartLine>(path)) {
    for (const fitment of line.fitments) {
      const row = fitmentToRow(line.id, fitment);
      yield csvLine([
        row.partId,
        row.variantId,
        row.buildFrom,
        row.buildTo,
        row.axle,
        row.equipmentCode,
      ]);
    }
  }
}

function* batches<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

class StepTimer {
  private last = performance.now();

  constructor(private readonly log: (message: string) => void) {}

  step(message: string): void {
    const now = performance.now();
    this.log(`${message} (${((now - this.last) / 1000).toFixed(1)}s)`);
    this.last = now;
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({ options: { from: { type: "string" } } });
  const from = values.from ? userPath(values.from) : join(dataDir(), "small");

  const started = performance.now();
  const result = await seedDatabase({ from, log: (message) => console.log(`  ${message}`) });
  await closeDb();
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`seeded from ${from} in ${seconds}s`);
  console.log(JSON.stringify(result));
}
