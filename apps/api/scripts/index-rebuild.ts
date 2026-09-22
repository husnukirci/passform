// Rebuilds the parts index from Postgres and moves the alias.
//   npm run index:rebuild
// Prints progress, then the result as one JSON line.

import { closeDb } from "../src/infra/db/client.js";
import { closeEsClient } from "../src/search/es.client.js";
import { rebuildIndex } from "../src/search/index-builder.js";

try {
  const result = await rebuildIndex({ log: (message) => console.log(`  ${message}`) });
  console.log(JSON.stringify(result));
} finally {
  await closeEsClient();
  await closeDb();
}
