// Filesystem anchors for the scripts. Resolved from this file so they hold
// whether a script is started from the repo root or from apps/api.

import { resolve } from "node:path";

export const API_ROOT = resolve(import.meta.dirname, "..");
export const REPO_ROOT = resolve(API_ROOT, "../..");
export const MIGRATIONS_FOLDER = resolve(API_ROOT, "drizzle");

/** `DATA_DIR` from the environment (default `./.data`), relative to the repo root. */
export function dataDir(): string {
  return resolve(REPO_ROOT, process.env.DATA_DIR ?? "./.data");
}
