// The read API over HTTP against the docker-compose Postgres and
// Elasticsearch, on the small profile. Works on a throwaway alias and seeds
// the database itself because integration files run in isolation.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  type PartDetailResponse,
  type ResolveVehicleResponse,
  type SearchResponse,
  type VehicleVariantDto,
} from "@passform/contracts";
import { sql } from "drizzle-orm";
import type { QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateDataset } from "../scripts/generate.js";
import { runMigrations } from "../scripts/migrate.js";
import { seedDatabase } from "../scripts/seed.js";
import { AppModule } from "../src/app.module.js";
import { closeDb, getDb } from "../src/infra/db/client.js";
import { aliasName } from "../src/search/alias.js";
import { closeEsClient, getEsClient } from "../src/search/es.client.js";
import { rebuildIndex } from "../src/search/index-builder.js";

process.env.SEARCH_ALIAS = "parts_apitest";

const db = getDb();
const es = getEsClient();
let app: INestApplication;

const api = (): ReturnType<typeof request> => request(app.getHttpServer());

async function one<T extends QueryResultRow>(query: ReturnType<typeof sql>): Promise<T> {
  const result = await db.execute<T>(query);
  // Drizzle types the rows through a deferred conditional that the constraint already satisfies.
  const row = result.rows[0] as T | undefined;
  if (row === undefined) throw new Error("query returned no rows");
  return row;
}

async function dropTestIndices(): Promise<void> {
  const found = await es.cat.indices({ index: `${aliasName()}_v*`, format: "json" });
  for (const row of found)
    if (row.index !== undefined) await es.indices.delete({ index: row.index });
}

/** The SQL mirror of the domain's fitment filter, as a count of parts. */
function fittedCount(
  variant: VehicleVariantDto,
  axle: "front" | "rear" | null,
): ReturnType<typeof sql> {
  const equipmentClause =
    variant.equipment.length === 0
      ? sql`true`
      : sql`(f.equipment_code is null or f.equipment_code in (${sql.join(
          variant.equipment.map((code) => sql`${code}`),
          sql`, `,
        )}))`;
  const axleClause = axle === null ? sql`true` : sql`(f.axle is null or f.axle = ${axle})`;
  return sql`
    select count(*)::int as n from parts p
     where p.universal
        or exists (
          select 1 from fitments f
           where f.part_id = p.id
             and f.variant_id = ${variant.id}
             and (f.build_from is null or f.build_from <= ${variant.buildFrom})
             and (f.build_to is null or f.build_to >= ${variant.buildFrom})
             and ${axleClause}
             and ${equipmentClause})`;
}

beforeAll(async () => {
  await dropTestIndices();
  await runMigrations();
  const dir = await mkdtemp(join(tmpdir(), "passform-api-"));
  try {
    await generateDataset({ profile: "small", out: dir });
    await seedDatabase({ from: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await rebuildIndex();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.init();
}, 120_000);

afterAll(async () => {
  await app.close();
  await dropTestIndices();
  await closeEsClient();
  await closeDb();
});

describe("GET /vehicles", () => {
  it("resolve asks to disambiguate a key the generator shares between variants", async () => {
    const shared = await one<{ manufacturer: string; type: string; n: number }>(
      sql`select key_manufacturer as manufacturer, key_type as type, count(*)::int as n
            from vehicle_variants group by 1, 2 having count(*) > 1 order by 1, 2 limit 1`,
    );

    const response = await api().get(
      `/vehicles/resolve?manufacturer=${shared.manufacturer}&type=${shared.type.toLowerCase()}`,
    );
    const body: ResolveVehicleResponse = response.body;

    expect(response.status).toBe(200);
    expect(body.needsDisambiguation).toBe(true);
    expect(body.variants).toHaveLength(shared.n);
    expect(body.variants.map((v) => v.buildFrom)).toEqual(
      [...body.variants.map((v) => v.buildFrom)].sort(),
    );
    for (const variant of body.variants) expect(variant.label).toContain(variant.engineCode);
  });

  it("resolve answers an empty list, not an error, for a key nobody has", async () => {
    const response = await api().get("/vehicles/resolve?manufacturer=0000&type=ZZZ");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ variants: [], needsDisambiguation: false });
  });

  it("makes, models and variants walk down to a variant that /vehicles/:id returns", async () => {
    const makes = await api().get("/vehicles/makes");
    const make: string = makes.body.makes[0];
    const models = await api().get(`/vehicles/models?make=${encodeURIComponent(make)}`);
    const model: string = models.body.models[0];
    const variants = await api().get(
      `/vehicles?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
    );
    const first: VehicleVariantDto = variants.body.variants[0];
    const byId = await api().get(`/vehicles/${first.id}`);

    expect(makes.body.makes.length).toBeGreaterThan(1);
    expect(models.body.models.length).toBeGreaterThan(0);
    expect(variants.body.variants.length).toBeGreaterThan(0);
    expect(byId.status).toBe(200);
    expect(byId.body).toEqual(first);
  });
});

describe("GET /search", () => {
  let variant: VehicleVariantDto;

  beforeAll(async () => {
    const response = await api().get("/vehicles/v_000001");
    variant = response.body;
  });

  it("returns only parts that fit or are universal, with a fit on every hit", async () => {
    const response = await api().get("/search?variantId=v_000001");
    const body: SearchResponse = response.body;
    const expected = await one<{ n: number }>(fittedCount(variant, null));

    expect(response.status).toBe(200);
    expect(body.stages.fitted).toBe(expected.n);
    expect(body.stages.shown).toBe(24);
    expect(body.hits).toHaveLength(24);
    expect(body).toMatchObject({ page: 1, pageSize: 24 });

    const skus = body.hits.map((hit) => hit.sku);
    const found = await db.execute<{ sku: string }>(sql`
      select p.sku from parts p
       where p.sku in (${sql.join(
         skus.map((sku) => sql`${sku}`),
         sql`, `,
       )})
         and (p.universal or exists (
           select 1 from fitments f where f.part_id = p.id and f.variant_id = ${variant.id}))`);
    expect(found.rows.map((row) => row.sku).sort()).toEqual([...skus].sort());
    for (const hit of body.hits) {
      expect(["fits", "ask"]).toContain(hit.fit.result);
      expect(hit.fit.reason.length).toBeGreaterThan(0);
    }
  });

  it("sort=price_asc is monotonic across the first two pages", async () => {
    const first = await api().get("/search?variantId=v_000001&sort=price_asc");
    const second = await api().get("/search?variantId=v_000001&sort=price_asc&page=2");
    const prices = [...first.body.hits, ...second.body.hits].map(
      (hit: SearchResponse["hits"][number]) => hit.priceCents,
    );

    expect(prices).toHaveLength(48);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("axle=front removes rear-only rows from the fitted set", async () => {
    // The variant with the most rear-axle rows, so the filter has something to remove.
    const rearHeavy = await one<{ variant_id: string }>(
      sql`select variant_id from fitments where axle = 'rear' group by 1 order by count(*) desc, 1 limit 1`,
    );
    const rearVariant: VehicleVariantDto = (await api().get(`/vehicles/${rearHeavy.variant_id}`))
      .body;
    const all = await api().get(`/search?variantId=${rearVariant.id}`);
    const front = await api().get(`/search?variantId=${rearVariant.id}&axle=front`);
    const expected = await one<{ n: number }>(fittedCount(rearVariant, "front"));

    expect(front.body.stages.fitted).toBe(expected.n);
    expect(front.body.stages.fitted).toBeLessThan(all.body.stages.fitted);
    for (const hit of front.body.hits as SearchResponse["hits"]) {
      expect(hit.fit.reason).not.toContain("rear axle");
    }
  });

  it("a variant with empty equipment gets an ask verdict on a part that needs a code", async () => {
    // The generator leaves 30% of variants without equipment and puts a code
    // on 10% of fitment rows; the seed has at least one such pair.
    const pair = await one<{ variant_id: string; sku: string; code: string }>(sql`
      select v.id as variant_id, p.sku, f.equipment_code as code
        from fitments f
        join vehicle_variants v on v.id = f.variant_id
        join parts p on p.id = f.part_id
       where cardinality(v.equipment) = 0
         and f.equipment_code is not null
         and f.axle is null
         and (f.build_from is null or f.build_from <= v.build_from)
         and (f.build_to is null or f.build_to >= v.build_from)
       order by v.id, p.sku limit 1`);

    const response = await api().get(`/search?variantId=${pair.variant_id}&q=${pair.sku}`);
    const body: SearchResponse = response.body;
    const hit = body.hits.find((h) => h.sku === pair.sku);

    expect(hit?.fit).toEqual({
      result: "ask",
      equipmentCode: pair.code,
      reason: `Fits if the vehicle has equipment ${pair.code}; confirm before ordering`,
    });
  });

  it("answers 404 for an unknown variant and 400 for a bad page", async () => {
    const unknown = await api().get("/search?variantId=v_nope");
    const badPage = await api().get("/search?variantId=v_000001&page=0");

    expect(unknown.status).toBe(404);
    expect(badPage.status).toBe(400);
    expect(badPage.body.issues[0].path).toBe("page");
  });
});

describe("GET /categories, /suppliers and /parts/:sku", () => {
  it("categories come back as a tree with the leaves under their parents", async () => {
    const response = await api().get("/categories");
    const leaf = await one<{ id: string; parent_id: string }>(
      sql`select id, parent_id from categories where parent_id is not null order by id limit 1`,
    );

    expect(response.status).toBe(200);
    const parent = response.body.categories.find((c: { id: string }) => c.id === leaf.parent_id);
    expect(parent.children.map((c: { id: string }) => c.id)).toContain(leaf.id);
  });

  it("suppliers come back in id order and match the table", async () => {
    const response = await api().get("/suppliers");
    const { n } = await one<{ n: number }>(sql`select count(*)::int as n from suppliers`);

    expect(response.status).toBe(200);
    expect(response.body.suppliers).toHaveLength(n);
    expect(response.body.suppliers[0]).toEqual({ id: "s_01", name: expect.any(String) });
  });

  it("a universal part reports the universal reason for any variant", async () => {
    const universal = await one<{ sku: string }>(
      sql`select sku from parts where universal order by id limit 1`,
    );

    const response = await api().get(`/parts/${universal.sku}?variantId=v_000001`);
    const body: PartDetailResponse = response.body;

    expect(response.status).toBe(200);
    expect(body.universal).toBe(true);
    expect(body.fitments).toEqual([]);
    expect(body.fit).toEqual({ result: "fits", reason: "Universal part, fits every vehicle" });
    expect(body.categoryPath.at(-1)).toBe(body.categorySlug);
  });

  it("a fitted part reports no fit without a variant and a verdict with one", async () => {
    const fitted = await one<{ sku: string; variant_id: string }>(sql`
      select p.sku, f.variant_id from parts p join fitments f on f.part_id = p.id
       where f.build_from is null and f.axle is null and f.equipment_code is null
       order by p.id limit 1`);

    const plain = await api().get(`/parts/${fitted.sku}`);
    const withVariant = await api().get(`/parts/${fitted.sku}?variantId=${fitted.variant_id}`);
    const unknownVariant = await api().get(`/parts/${fitted.sku}?variantId=v_nope`);
    const unknownSku = await api().get("/parts/nope");

    expect(plain.body.fit).toBeNull();
    expect(plain.body.fitments.length).toBeGreaterThan(0);
    expect(withVariant.body.fit.result).toBe("fits");
    expect(unknownVariant.status).toBe(404);
    expect(unknownSku.status).toBe(404);
  });
});
