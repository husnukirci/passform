// Filesystem anchors for the scripts. Resolved from this file so they hold
// whether a script is started from the repo root or from apps/api.

import { resolve } from "node:path";

export { dataDir, REPO_ROOT } from "../src/infra/data-dir.js";

export const API_ROOT = resolve(import.meta.dirname, "..");
export const MIGRATIONS_FOLDER = resolve(API_ROOT, "drizzle");

/**
 * A path typed on the command line, resolved against the directory npm was
 * invoked from (`INIT_CWD`) rather than the workspace, so
 * `npm run db:seed -- --from .data/large` at the repo root does what it says.
 */
export function userPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
