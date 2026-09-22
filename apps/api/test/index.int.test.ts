// Index builder against the docker-compose Postgres and Elasticsearch.
// Works on a throwaway alias so the dev `parts` alias is never touched, and
// seeds the small profile itself because integration files run in isolation.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSearchQuery, type VehicleVariant } from "@passform/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateDataset } from "../scripts/generate.js";
import { runMigrations } from "../scripts/migrate.js";
import { seedDatabase } from "../scripts/seed.js";
import { closeDb, getDb } from "../src/infra/db/client.js";
import { rowToVariant } from "../src/infra/db/mappers.js";
import { vehicleVariants } from "../src/infra/db/schema.js";
import { aliasName, currentIndexName } from "../src/search/alias.js";
import { closeEsClient, getEsClient } from "../src/search/es.client.js";
import { countParts, IndexVerificationError, rebuildIndex } from "../src/search/index-builder.js";

process.env.SEARCH_ALIAS = "parts_inttest";

const db = getDb();
const es = getEsClient();
const alias = aliasName();

async function physicalIndices(): Promise<string[]> {
  const found = await es.cat.indices({ index: `${alias}_v*`, format: "json" });
  return found.map((row) => row.index ?? "").sort();
}

/** Wildcard deletes are off by default in Elasticsearch, so each index is named. */
async function dropTestIndices(): Promise<void> {
  for (const index of await physicalIndices()) await es.indices.delete({ index });
}

async function skusInSql(query: ReturnType<typeof sql>): Promise<string[]> {
  const result = await db.execute<{ sku: string }>(query);
  return result.rows.map((row) => row.sku).sort();
}

beforeAll(async () => {
  await dropTestIndices();
  await runMigrations();
  const dir = await mkdtemp(join(tmpdir(), "passform-index-"));
  try {
    await generateDataset({ profile: "small", out: dir });
    await seedDatabase({ from: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

afterAll(async () => {
  await dropTestIndices();
  await closeEsClient();
  await closeDb();
});

describe("rebuildIndex", () => {
  it("builds a verified index from the seed and points the alias at it", async () => {
    const result = await rebuildIndex();

    expect(result.index).toMatch(new RegExp(`^${alias}_v\\d+$`));
    expect(result.count).toBe(5000);
    expect(result.maxFitments).toBeGreaterThan(0);
    expect(await currentIndexName()).toBe(result.index);
    expect((await es.count({ index: alias })).count).toBe(5000);
    const settings = await es.indices.getSettings({ index: result.index });
    expect(settings[result.index]?.settings?.index?.refresh_interval).toBe("1s");
  });

  it("swaps to a new index on the next rebuild and drops the old one", async () => {
    const previous = await currentIndexName();

    const result = await rebuildIndex();

    expect(result.index).not.toBe(previous);
    expect(await currentIndexName()).toBe(result.index);
    expect(await physicalIndices()).toEqual([result.index]);
  });

  it("leaves the alias alone and deletes the new index when the count does not verify", async () => {
    const previous = await currentIndexName();
    // As if ten parts vanished from Postgres between the stream and the check.
    const countSource = async (): Promise<number> => (await countParts(db)) - 10;

    await expect(rebuildIndex({ countSource })).rejects.toMatchObject({
      name: "IndexVerificationError",
      expected: 4990,
      indexed: 5000,
    });
    await expect(rebuildIndex({ countSource })).rejects.toBeInstanceOf(IndexVerificationError);

    expect(await currentIndexName()).toBe(previous);
    expect(await physicalIndices()).toEqual([previous]);
  });
});

describe("the domain query against the built index", () => {
  let variant: VehicleVariant;

  beforeAll(async () => {
    // The variant with the most fitment rows, so the nested filter has work to do.
    const busiest = await db.execute<{ variant_id: string }>(
      sql`select variant_id from fitments group by variant_id order by count(*) desc, variant_id limit 1`,
    );
    const variantId = busiest.rows[0]?.variant_id ?? "";
    const [row] = await db
      .select()
      .from(vehicleVariants)
      .where(sql`${vehicleVariants.id} = ${variantId}`);
    if (row === undefined) throw new Error("seed has no fitments");
    variant = rowToVariant(row);
  });

  it("returns exactly the parts with a matching nested fitment or universal: true", async () => {
    const body = buildSearchQuery({ variant, sort: "default", page: 1 });
    // The domain pages by 24; widen the window so the whole set can be compared.
    const response = await es.search<{ sku: string }>({ index: alias, ...body, size: 10_000 });
    const hits = response.hits.hits.map((hit) => hit._source?.sku ?? "").sort();

    // `unlessSet` in the domain: a restriction only applies when the row carries it,
    // and the equipment clause exists only when the variant lists equipment.
    const equipmentClause =
      variant.equipment.length === 0
        ? sql`true`
        : sql`(f.equipment_code is null or f.equipment_code in (${sql.join(
            variant.equipment.map((code) => sql`${code}`),
            sql`, `,
          )}))`;
    const expected = await skusInSql(sql`
      select p.sku from parts p where p.universal
      union
      select p.sku from parts p join fitments f on f.part_id = p.id
       where f.variant_id = ${variant.id}
         and (f.build_from is null or f.build_from <= ${variant.buildFrom})
         and (f.build_to is null or f.build_to >= ${variant.buildFrom})
         and ${equipmentClause}
      order by 1`);

    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(5000);
    expect(hits).toEqual(expected);
  });

  it("indexes build dates in the domain's yyyy-MM format: a range on 2012-08 matches the SQL window", async () => {
    const response = await es.count({
      index: alias,
      query: {
        nested: {
          path: "fitments",
          query: { range: { "fitments.build_from": { lte: "2012-08" } } },
        },
      },
    });
    const expected = await skusInSql(
      sql`select distinct p.sku from parts p join fitments f on f.part_id = p.id where f.build_from <= '2012-08' order by 1`,
    );

    expect(expected.length).toBeGreaterThan(0);
    expect(response.count).toBe(expected.length);
  });
});
