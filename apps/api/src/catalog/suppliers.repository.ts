import { Inject, Injectable } from "@nestjs/common";
import type { SupplierDto } from "@passform/contracts";
import { asc, eq } from "drizzle-orm";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { suppliers } from "../infra/db/schema.js";

@Injectable()
export class SuppliersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every supplier by id; the table holds a handful of rows. */
  async all(): Promise<SupplierDto[]> {
    return this.db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .orderBy(asc(suppliers.id));
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, id));
    return row !== undefined;
  }
}
