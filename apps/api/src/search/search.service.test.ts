import type { estypes } from "@elastic/elasticsearch";
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { variant } from "../vehicles/fixtures.js";
import { VehiclesRepository } from "../vehicles/vehicles.repository.js";
import type { HitSource } from "./documents.js";
import { ES_CLIENT } from "./search-infra.module.js";
import { SearchService } from "./search.service.js";

const source = (overrides: Partial<HitSource>): HitSource => ({
  sku: "QRB-0000001",
  name: "Quorabrake Pads K240",
  brand: "Quorabrake",
  brand_tier: "premium",
  category_path: ["brakes", "brakes/pads"],
  oe_ref: "VEL-12345",
  attributes: { axle: "front" },
  price_cents: 4990,
  in_stock: true,
  universal: false,
  ...overrides,
});

/** Two hits: one that matched a nested row for the variant, one universal part. */
const response: estypes.SearchResponse<HitSource> = {
  took: 3,
  timed_out: false,
  _shards: { total: 1, successful: 1, failed: 0 },
  hits: {
    total: { value: 57, relation: "eq" },
    hits: [
      {
        _index: "parts_v1",
        _id: "p_0000001",
        _source: source({}),
        inner_hits: {
          fitments: {
            hits: {
              hits: [
                {
                  _index: "parts_v1",
                  _id: "p_0000001",
                  _source: {
                    variant_id: "v_000001",
                    build_from: null,
                    build_to: null,
                    axle: "front",
                    equipment_code: null,
                  },
                },
              ],
            },
          },
        },
      },
      {
        _index: "parts_v1",
        _id: "p_0000002",
        _source: source({
          sku: "LUM-0000002",
          name: "Lumetra Bulb H7",
          brand: "Lumetra",
          brand_tier: "standard",
          category_path: ["lighting", "lighting/bulbs"],
          attributes: {},
          price_cents: 890,
          universal: true,
        }),
      },
    ],
  },
};

async function serviceWith(search: (params: unknown) => Promise<unknown>): Promise<SearchService> {
  const vehicles: Pick<VehiclesRepository, "findById"> = {
    findById: async (id) => (id === "v_000001" ? variant() : null),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      SearchService,
      { provide: ES_CLIENT, useValue: { search } },
      { provide: VehiclesRepository, useValue: vehicles },
    ],
  }).compile();
  return moduleRef.get(SearchService);
}

describe("SearchService.search", () => {
  it("runs the domain query against the alias and evaluates fit per hit", async () => {
    const search = vi.fn(async () => response);
    const service = await serviceWith(search);

    const result = await service.search({ variantId: "v_000001", sort: "default", page: 2 });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ index: "parts", from: 24, size: 24, track_total_hits: true }),
    );
    expect(result.stages).toEqual({ fitted: 57, shown: 2 });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(24);
    expect(result.hits.map((hit) => [hit.id, hit.categorySlug, hit.fit])).toEqual([
      [
        "p_0000001",
        "brakes/pads",
        {
          result: "fits",
          reason: "Fits Veltrano Corvex D16-85 (2012-03 → 2018-06) on the front axle",
        },
      ],
      [
        "p_0000002",
        "lighting/bulbs",
        { result: "fits", reason: "Universal part, fits every vehicle" },
      ],
    ]);
    expect(result.hits[0]).toMatchObject({ sku: "QRB-0000001", priceCents: 4990, inStock: true });
  });

  it("passes the chosen axle to the fit evaluation", async () => {
    const service = await serviceWith(async () => response);

    const result = await service.search({
      variantId: "v_000001",
      axle: "rear",
      sort: "default",
      page: 1,
    });

    expect(result.hits[0]?.fit).toEqual({ result: "no", reason: "Only for the front axle" });
  });

  it("answers 404 for an unknown variant without querying the index", async () => {
    const search = vi.fn(async () => response);
    const service = await serviceWith(search);

    await expect(
      service.search({ variantId: "v_nope", sort: "default", page: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(search).not.toHaveBeenCalled();
  });
});
