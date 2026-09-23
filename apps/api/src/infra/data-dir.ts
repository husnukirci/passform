// `DATA_DIR` (default `./.data`) resolved against the repo root from this
// file's own location, so the same path holds whether the API runs from
// `src` under vitest, from `dist` in production, or a script runs from
// `apps/api`. Generated datasets and import files live under it.

import { resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dirname, "../../../..");

export function dataDir(): string {
  return resolve(REPO_ROOT, process.env.DATA_DIR ?? "./.data");
}
