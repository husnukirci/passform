import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DomainError } from "@passform/domain";
import { describe, expect, it, vi } from "vitest";

import { variant } from "./fixtures.js";
import { VehiclesRepository } from "./vehicles.repository.js";
import { VehiclesService } from "./vehicles.service.js";

async function serviceWith(
  repository: Pick<VehiclesRepository, "findByKey" | "findById">,
): Promise<VehiclesService> {
  const moduleRef = await Test.createTestingModule({
    providers: [VehiclesService, { provide: VehiclesRepository, useValue: repository }],
  }).compile();
  return moduleRef.get(VehiclesService);
}

describe("VehiclesService.resolve", () => {
  it("returns the one variant a key resolves to, labelled, without asking", async () => {
    const only = variant();
    const findByKey = vi.fn(async () => [only]);
    const service = await serviceWith({ findByKey, findById: async () => null });

    const response = await service.resolve({ manufacturer: " 1103 ", type: "001" });

    expect(findByKey).toHaveBeenCalledWith({ manufacturer: "1103", type: "001" });
    expect(response).toEqual({
      variants: [{ ...only, label: "D16-85 · 85 kW · diesel · 2012-03 → 2018-06" }],
      needsDisambiguation: false,
    });
  });

  it("asks when several variants share the key, oldest build first", async () => {
    const later = variant({ id: "v_000002", buildFrom: "2015-01", kw: 110 });
    const earlier = variant();
    const service = await serviceWith({
      findByKey: async () => [later, earlier],
      findById: async () => null,
    });

    const response = await service.resolve({ manufacturer: "1103", type: "001" });

    expect(response.needsDisambiguation).toBe(true);
    expect(response.variants.map((v) => v.id)).toEqual(["v_000001", "v_000002"]);
  });

  it("rejects a malformed key before touching the repository", async () => {
    const findByKey = vi.fn(async () => []);
    const service = await serviceWith({ findByKey, findById: async () => null });

    await expect(service.resolve({ manufacturer: "12", type: "001" })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(findByKey).not.toHaveBeenCalled();
  });
});

describe("VehiclesService.getById", () => {
  it("throws NotFoundException for an unknown id", async () => {
    const service = await serviceWith({ findByKey: async () => [], findById: async () => null });

    await expect(service.getById("v_nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
