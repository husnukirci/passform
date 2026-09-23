import { Module } from "@nestjs/common";

import { getDb } from "./client.js";

/** Injection token for the shared Drizzle database handle. */
export const DB = Symbol("DB");

@Module({
  providers: [{ provide: DB, useFactory: getDb }],
  exports: [DB],
})
export class DbModule {}
