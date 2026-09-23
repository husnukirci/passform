import { Inject, Injectable } from "@nestjs/common";
import type { Fitment, Part } from "@passform/domain";
import { asc, eq, sql } from "drizzle-orm";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { rowToFitment, rowToPart } from "../infra/db/mappers.js";
import { fitments, parts } from "../infra/db/schema.js";

export interface PartRecord {
  part: Part;
  /** Every ancestor slug plus the leaf, root first. */
  categoryPath: string[];
  fitments: Fitment[];
}

@Injectable()
export class PartsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findBySku(sku: string): Promise<PartRecord | null> {
    const [row] = await this.db.select().from(parts).where(eq(parts.sku, sku));
    if (row === undefined) return null;
    const part = rowToPart(row);

    const [rows, categoryPath] = await Promise.all([
      this.db.select().from(fitments).where(eq(fitments.partId, part.id)).orderBy(asc(fitments.id)),
      this.categoryPath(part.categorySlug),
    ]);
    return { part, categoryPath, fitments: rows.map(rowToFitment) };
  }

  /** Walks `parent_id` up to the root in one recursive query. */
  private async categoryPath(leaf: string): Promise<string[]> {
    const result = await this.db.execute<{ id: string }>(sql`
      with recursive path as (
        select id, parent_id, 0 as depth from categories where id = ${leaf}
        union all
        select c.id, c.parent_id, path.depth + 1 from categories c join path on c.id = path.parent_id
      )
      select id from path order by depth desc`);
    return result.rows.map((row) => row.id);
  }
}
