// The fast index path (ADR 11). Postgres is written first, in the parts
// repository's transaction; then the live alias gets one bulk of partial
// updates carrying price and availability only. Once Postgres has
// committed nothing here throws: an index failure is a warning and
// `indexed: false`, because the values are absolute (a retry lands the
// same state) and the next rebuild repairs the index anyway.

import type { Client } from "@elastic/elasticsearch";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { StockUpdateBody, StockUpdateResponse } from "@passform/contracts";

import { type AppliedStock, PartsRepository } from "../catalog/parts.repository.js";
import { SuppliersRepository } from "../catalog/suppliers.repository.js";
import { aliasName } from "../search/alias.js";
import { inStockOf, type PartDocument } from "../search/documents.js";
import { ES_CLIENT } from "../search/search-infra.module.js";

/** The only fields the fast path may touch; `fitments` is off limits (ADR 5, ADR 11). */
type StockPatch = Pick<PartDocument, "price_cents" | "in_stock">;

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly suppliers: SuppliersRepository,
    private readonly parts: PartsRepository,
    @Inject(ES_CLIENT) private readonly es: Client,
  ) {}

  async apply(supplierId: string, body: StockUpdateBody): Promise<StockUpdateResponse> {
    if (!(await this.suppliers.exists(supplierId))) {
      throw new NotFoundException(`supplier ${supplierId} not found`);
    }
    const { applied, unknown } = await this.parts.applyStockUpdate(supplierId, body.rows);
    const indexed = await this.patchIndex(applied);
    return { updated: applied.length, unknown, indexed };
  }

  /** True when every applied part is now current in the index. */
  private async patchIndex(applied: AppliedStock[]): Promise<boolean> {
    if (applied.length === 0) return true;
    const ids = applied.map((part) => part.id);
    try {
      const response = await this.es.bulk({
        index: aliasName(),
        refresh: "wait_for",
        operations: applied.flatMap((part) => {
          const doc: StockPatch = {
            price_cents: part.priceCents,
            in_stock: inStockOf(part.stockQty),
          };
          return [{ update: { _id: part.id } }, { doc }];
        }),
      });
      if (!response.errors) return true;
      const failed = response.items.flatMap((item) =>
        item.update?.error === undefined ? [] : [item.update._id ?? "?"],
      );
      this.logger.warn(
        `index patch failed for ${failed.length} of ${ids.length} parts: ${failed.join(", ")}`,
      );
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`index patch failed for parts ${ids.join(", ")}: ${message}`);
      return false;
    }
  }
}
