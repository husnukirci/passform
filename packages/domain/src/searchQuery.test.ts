import { describe, expect, it } from "vitest";

import { BOOSTS, buildSearchQuery, PAGE_SIZE, type SearchInput } from "./searchQuery.ts";
import { DomainError, type VehicleVariant } from "./types.ts";

const VARIANT: VehicleVariant = {
  id: "v_000001",
  make: "Aldervane",
  model: "Corvin",
  engineCode: "AV14D",
  kw: 85,
  fuel: "diesel",
  buildFrom: "2012-08",
  buildTo: "2018-06",
  equipment: [],
  key: { manufacturer: "0588", type: "AKX" },
};

const WITH_EQUIPMENT: VehicleVariant = { ...VARIANT, equipment: ["SPORT_SUSP", "TOW_HITCH"] };

const MINIMAL: SearchInput = { variant: VARIANT, sort: "default", page: 1 };

/** A "null or matches" clause: the restriction is absent, or it holds. */
function optionalClause(field: string, match: object) {
  return {
    bool: {
      should: [{ bool: { must_not: { exists: { field } } } }, match],
      minimum_should_match: 1,
    },
  };
}

function fitmentFilter(v: VehicleVariant, extra: object[] = []) {
  return {
    bool: {
      should: [
        {
          nested: {
            path: "fitments",
            query: {
              bool: {
                filter: [
                  { term: { "fitments.variant_id": v.id } },
                  optionalClause("fitments.build_from", {
                    range: { "fitments.build_from": { lte: v.buildFrom } },
                  }),
                  optionalClause("fitments.build_to", {
                    range: { "fitments.build_to": { gte: v.buildFrom } },
                  }),
                  ...extra,
                ],
              },
            },
            inner_hits: { size: 10 },
          },
        },
        { term: { universal: true } },
      ],
      minimum_should_match: 1,
    },
  };
}

const RANKING = [
  { term: { in_stock: { value: true, boost: BOOSTS.inStock } } },
  { term: { brand_tier: { value: "oe", boost: BOOSTS.oe } } },
  { term: { brand_tier: { value: "premium", boost: BOOSTS.premium } } },
];

describe("buildSearchQuery", () => {
  it("emits the constrain-then-rank body for a minimal input", () => {
    expect(buildSearchQuery(MINIMAL)).toEqual({
      query: { bool: { filter: [fitmentFilter(VARIANT)], should: RANKING } },
      sort: ["_score", { price_cents: "asc" }],
      from: 0,
      size: PAGE_SIZE,
      track_total_hits: true,
      _source: { excludes: ["fitments"] },
    });
  });

  it("adds category, brand and text facets as filters, in that order", () => {
    const body = buildSearchQuery({
      ...MINIMAL,
      categorySlug: "brakes/discs",
      brand: "Ostrafen",
      q: "front disc",
    });

    expect(body.query).toEqual({
      bool: {
        filter: [
          fitmentFilter(VARIANT),
          { term: { category_path: "brakes/discs" } },
          { term: { brand: "Ostrafen" } },
          { multi_match: { query: "front disc", fields: ["name", "sku", "oe_ref", "brand"] } },
        ],
        should: RANKING,
      },
    });
  });

  it("constrains fitment axle only when an axle is chosen", () => {
    const body = buildSearchQuery({ ...MINIMAL, axle: "front" });

    expect(body.query).toEqual({
      bool: {
        filter: [
          fitmentFilter(VARIANT, [
            optionalClause("fitments.axle", { term: { "fitments.axle": "front" } }),
          ]),
        ],
        should: RANKING,
      },
    });
  });

  it("treats a null axle like no axle", () => {
    expect(buildSearchQuery({ ...MINIMAL, axle: null })).toEqual(buildSearchQuery(MINIMAL));
  });

  it("constrains equipment when the variant's equipment is known", () => {
    const body = buildSearchQuery({ ...MINIMAL, variant: WITH_EQUIPMENT });

    expect(body.query).toEqual({
      bool: {
        filter: [
          fitmentFilter(WITH_EQUIPMENT, [
            optionalClause("fitments.equipment_code", {
              terms: { "fitments.equipment_code": ["SPORT_SUSP", "TOW_HITCH"] },
            }),
          ]),
        ],
        should: RANKING,
      },
    });
  });

  it("leaves equipment unconstrained when the variant's equipment is unknown", () => {
    const body = buildSearchQuery(MINIMAL);

    expect(JSON.stringify(body)).not.toContain("equipment_code");
  });

  it("sorts by score then price for the default sort", () => {
    expect(buildSearchQuery({ ...MINIMAL, sort: "default" }).sort).toEqual([
      "_score",
      { price_cents: "asc" },
    ]);
  });

  it("sorts by price ascending", () => {
    expect(buildSearchQuery({ ...MINIMAL, sort: "price_asc" }).sort).toEqual([
      { price_cents: "asc" },
    ]);
  });

  it("sorts by price descending", () => {
    expect(buildSearchQuery({ ...MINIMAL, sort: "price_desc" }).sort).toEqual([
      { price_cents: "desc" },
    ]);
  });

  it("pages with a fixed size", () => {
    const body = buildSearchQuery({ ...MINIMAL, page: 3 });

    expect(body.from).toBe(2 * PAGE_SIZE);
    expect(body.size).toBe(PAGE_SIZE);
  });

  it("rejects a page below 1", () => {
    expect(() => buildSearchQuery({ ...MINIMAL, page: 0 })).toThrow(DomainError);
  });

  it("keeps the universal short-circuit in every body", () => {
    const inputs: SearchInput[] = [
      MINIMAL,
      { ...MINIMAL, variant: WITH_EQUIPMENT, axle: "rear" },
      { ...MINIMAL, q: "x", brand: "Ostrafen", categorySlug: "brakes", sort: "price_desc" },
    ];

    for (const input of inputs) {
      expect(JSON.stringify(buildSearchQuery(input))).toContain(
        JSON.stringify({ term: { universal: true } }),
      );
    }
  });

  it("never lets fitment contribute to the score", () => {
    const body = buildSearchQuery({ ...MINIMAL, variant: WITH_EQUIPMENT, axle: "front" });

    // SearchBody keeps `query` opaque on purpose; the test knows the shape it asserted above.
    const query = body.query as { bool: { should: unknown[] } };

    expect(JSON.stringify(query.bool.should)).not.toContain("fitments");
  });
});
