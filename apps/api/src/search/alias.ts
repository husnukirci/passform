// The alias is the only index name the API ever reads (ADR 6). Physical
// indices are `<alias>_v<unix-ms>`; a rebuild writes a new one and moves the
// alias in a single atomic call. SEARCH_ALIAS overrides the name so tests
// can work on a throwaway alias without touching `parts`.

import type { Client } from "@elastic/elasticsearch";

import { getEsClient } from "./es.client.js";

export const ALIAS = "parts";

export function aliasName(): string {
  return process.env.SEARCH_ALIAS ?? ALIAS;
}

export function nextIndexName(): string {
  return `${aliasName()}_v${Date.now()}`;
}

/** The physical index behind the alias, or null before the first rebuild. */
export async function currentIndexName(es: Client = getEsClient()): Promise<string | null> {
  const name = aliasName();
  if (!(await es.indices.existsAlias({ name }))) return null;
  const indices = Object.keys(await es.indices.getAlias({ name }));
  return indices[0] ?? null;
}

/** Points the alias at `to`, removing it from the previous index in the same call. */
export async function swapAlias(
  to: string,
  es: Client = getEsClient(),
): Promise<{ from: string | null }> {
  const alias = aliasName();
  const from = await currentIndexName(es);
  const actions = from === null ? [] : [{ remove: { index: from, alias } }];
  await es.indices.updateAliases({ actions: [...actions, { add: { index: to, alias } }] });
  return { from };
}

export async function deleteIndex(index: string, es: Client = getEsClient()): Promise<void> {
  await es.indices.delete({ index });
}
