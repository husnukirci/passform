import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { PartsRepository, type StockUpdateResult } from "../catalog/parts.repository.js";
import { SuppliersRepository } from "../catalog/suppliers.repository.js";
import { ES_CLIENT } from "../search/search-infra.module.js";
import { StockService } from "./stock.service.js";

const BODY = {
  rows: [
    { sku: "QB-1001", priceCents: 5290, stockQty: 5 },
    { sku: "QB-1002", stockQty: 0 },
    { sku: "QB-9999", priceCents: 1 },
  ],
};
const RESULT: StockUpdateResult = {
  applied: [
    { id: "p_0000001", priceCents: 5290, stockQty: 3 },
    { id: "p_0000002", priceCents: 1250, stockQty: 0 },
  ],
  unknown: ["QB-9999"],
};

type Bulk = (params: unknown) => Promise<unknown>;

function stubs(result: StockUpdateResult = RESULT) {
  const suppliers = { exists: vi.fn(async (id: string) => id === "s_01") };
  const parts = { applyStockUpdate: vi.fn(async () => result) };
  const bulk = vi.fn<Bulk>(async () => ({ errors: false, items: [] }));
  return { suppliers, parts, bulk };
}

async function serviceWith({
  suppliers,
  parts,
  bulk,
}: ReturnType<typeof stubs>): Promise<StockService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StockService,
      { provide: SuppliersRepository, useValue: suppliers },
      { provide: PartsRepository, useValue: parts },
      { provide: ES_CLIENT, useValue: { bulk } },
    ],
  }).compile();
  return moduleRef.get(StockService);
}

describe("StockService.apply", () => {
  it("writes the delta, patches price and availability on the alias and reports the counts", async () => {
    const deps = stubs();
    const service = await serviceWith(deps);

    const response = await service.apply("s_01", BODY);

    expect(response).toEqual({ updated: 2, unknown: ["QB-9999"], indexed: true });
    expect(deps.parts.applyStockUpdate).toHaveBeenCalledWith("s_01", BODY.rows);
    expect(deps.bulk).toHaveBeenCalledTimes(1);
    expect(deps.bulk).toHaveBeenCalledWith({
      index: "parts",
      refresh: "wait_for",
      operations: [
        { update: { _id: "p_0000001" } },
        { doc: { price_cents: 5290, in_stock: true } },
        { update: { _id: "p_0000002" } },
        { doc: { price_cents: 1250, in_stock: false } },
      ],
    });
  });

  it("answers 404 for an unknown supplier before touching the parts", async () => {
    const deps = stubs();
    const service = await serviceWith(deps);

    await expect(service.apply("s_99", BODY)).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.parts.applyStockUpdate).not.toHaveBeenCalled();
    expect(deps.bulk).not.toHaveBeenCalled();
  });

  it("reports indexed: false when the bulk call throws, after Postgres has committed", async () => {
    const deps = stubs();
    deps.bulk.mockRejectedValueOnce(new Error("connection refused"));
    const service = await serviceWith(deps);

    expect(await service.apply("s_01", BODY)).toEqual({
      updated: 2,
      unknown: ["QB-9999"],
      indexed: false,
    });
  });

  it("reports indexed: false when any bulk item failed", async () => {
    const deps = stubs();
    deps.bulk.mockResolvedValueOnce({
      errors: true,
      items: [
        { update: { _id: "p_0000001", status: 200 } },
        {
          update: { _id: "p_0000002", status: 404, error: { type: "document_missing_exception" } },
        },
      ],
    });
    const service = await serviceWith(deps);

    expect((await service.apply("s_01", BODY)).indexed).toBe(false);
  });

  it("skips the bulk call when no row matched and still reports the index as current", async () => {
    const deps = stubs({ applied: [], unknown: ["QB-1001", "QB-1002", "QB-9999"] });
    const service = await serviceWith(deps);

    expect(await service.apply("s_01", BODY)).toEqual({
      updated: 0,
      unknown: ["QB-1001", "QB-1002", "QB-9999"],
      indexed: true,
    });
    expect(deps.bulk).not.toHaveBeenCalled();
  });
});
