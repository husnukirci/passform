// One lazily created Elasticsearch client per process, built from
// ELASTICSEARCH_URL. Mirrors infra/db/client.ts: scripts and tests share it,
// the Nest app gets it through SearchInfraModule, nothing connects at import.

import { Client } from "@elastic/elasticsearch";

let client: Client | undefined;

export function elasticsearchUrl(): string {
  const url = process.env.ELASTICSEARCH_URL;
  if (!url) throw new Error("ELASTICSEARCH_URL is not set");
  return url;
}

export function getEsClient(): Client {
  client ??= new Client({ node: elasticsearchUrl() });
  return client;
}

/** Closes the client so scripts and test runners can exit. Safe to call twice. */
export async function closeEsClient(): Promise<void> {
  const open = client;
  client = undefined;
  await open?.close();
}
