import { Inject, Injectable } from "@nestjs/common";
import type { RegistrationKey, VehicleVariant } from "@passform/domain";
import { and, asc, eq } from "drizzle-orm";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { rowToVariant } from "../infra/db/mappers.js";
import { vehicleVariants } from "../infra/db/schema.js";

@Injectable()
export class VehiclesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every variant registered under the key; several is normal. */
  async findByKey(key: RegistrationKey): Promise<VehicleVariant[]> {
    const rows = await this.db
      .select()
      .from(vehicleVariants)
      .where(
        and(
          eq(vehicleVariants.keyManufacturer, key.manufacturer),
          eq(vehicleVariants.keyType, key.type),
        ),
      );
    return rows.map(rowToVariant);
  }

  async findById(id: string): Promise<VehicleVariant | null> {
    const [row] = await this.db.select().from(vehicleVariants).where(eq(vehicleVariants.id, id));
    return row === undefined ? null : rowToVariant(row);
  }

  async listMakes(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ make: vehicleVariants.make })
      .from(vehicleVariants)
      .orderBy(asc(vehicleVariants.make));
    return rows.map((row) => row.make);
  }

  async listModels(make: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ model: vehicleVariants.model })
      .from(vehicleVariants)
      .where(eq(vehicleVariants.make, make))
      .orderBy(asc(vehicleVariants.model));
    return rows.map((row) => row.model);
  }

  /** In the order a customer reads them: oldest build first, then by power. */
  async listVariants(make: string, model: string): Promise<VehicleVariant[]> {
    const rows = await this.db
      .select()
      .from(vehicleVariants)
      .where(and(eq(vehicleVariants.make, make), eq(vehicleVariants.model, model)))
      .orderBy(asc(vehicleVariants.buildFrom), asc(vehicleVariants.kw), asc(vehicleVariants.id));
    return rows.map(rowToVariant);
  }
}
