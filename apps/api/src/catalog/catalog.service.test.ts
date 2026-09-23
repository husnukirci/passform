import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { variant } from "../vehicles/fixtures.js";
import { VehiclesRepository } from "../vehicles/vehicles.repository.js";
import { CatalogService } from "./catalog.service.js";
import { CategoriesRepository } from "./categories.repository.js";
import { fitment, part } from "./fixtures.js";
import { type PartRecord, PartsRepository } from "./parts.repository.js";
import { SuppliersRepository } from "./suppliers.repository.js";

const record: PartRecord = {
  part: part(),
  categoryPath: ["brakes", "brakes/pads"],
  fitments: [fitment({ axle: "front" }), fitment({ variantId: "v_000009" })],
};

async function serviceWith(records: Record<string, PartRecord>): Promise<CatalogService> {
  const parts: Pick<PartsRepository, "findBySku"> = {
    findBySku: async (sku) => records[sku] ?? null,
  };
  const vehicles: Pick<VehiclesRepository, "findById"> = {
    findById: async (id) => (id === "v_000001" ? variant() : null),
  };
  const categories: Pick<CategoriesRepository, "tree"> = { tree: async () => [] };
  const suppliers: Pick<SuppliersRepository, "all"> = {
    all: async () => [{ id: "s_01", name: "Brenholt Distribution" }],
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      CatalogService,
      { provide: PartsRepository, useValue: parts },
      { provide: VehiclesRepository, useValue: vehicles },
      { provide: CategoriesRepository, useValue: categories },
      { provide: SuppliersRepository, useValue: suppliers },
    ],
  }).compile();
  return moduleRef.get(CatalogService);
}

describe("CatalogService.supplierList", () => {
  it("wraps the repository rows", async () => {
    const service = await serviceWith({});

    await expect(service.supplierList()).resolves.toEqual({
      suppliers: [{ id: "s_01", name: "Brenholt Distribution" }],
    });
  });
});

describe("CatalogService.partDetail", () => {
  it("returns the part with its path and fitments, and fit null without a variant", async () => {
    const service = await serviceWith({ [record.part.sku]: record });

    const detail = await service.partDetail(record.part.sku, {});

    expect(detail).toEqual({
      ...record.part,
      categoryPath: ["brakes", "brakes/pads"],
      fit: null,
      fitments: record.fitments,
    });
  });

  it("evaluates fit for the named variant, with no axle chosen", async () => {
    const service = await serviceWith({ [record.part.sku]: record });

    const detail = await service.partDetail(record.part.sku, { variantId: "v_000001" });

    expect(detail.fit).toEqual({
      result: "fits",
      reason: "Fits Veltrano Corvex D16-85 (2012-03 → 2018-06) on the front axle",
    });
  });

  it("answers 404 for an unknown sku and for an unknown variant", async () => {
    const service = await serviceWith({ [record.part.sku]: record });

    await expect(service.partDetail("nope", {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.partDetail(record.part.sku, { variantId: "v_nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
