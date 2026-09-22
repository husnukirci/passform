// Applies the committed migrations under apps/api/drizzle. Used by
// `npm run db:migrate`, by CI before the integration tests, and by the
// schema integration test, so all three take the same code path.

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "../src/infra/db/client.js";
import { MIGRATIONS_FOLDER } from "./paths.js";

export async function runMigrations(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: MIGRATIONS_FOLDER });
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  await runMigrations();
  await closeDb();
  console.log(`migrations applied from ${MIGRATIONS_FOLDER}`);
}
