// One lazily created pool per process, built from DATABASE_URL. Scripts and
// tests share it; nothing opens a connection at import time.

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let db: Db | undefined;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: databaseUrl() });
  return pool;
}

export function getDb(): Db {
  db ??= drizzle(getPool(), { schema });
  return db;
}

/** Ends the pool so scripts and test runners can exit. Safe to call twice. */
export async function closeDb(): Promise<void> {
  const open = pool;
  pool = undefined;
  db = undefined;
  await open?.end();
}
