import { Module } from "@nestjs/common";

import { getEsClient } from "./es.client.js";

/** Injection token for the shared Elasticsearch client. */
export const ES_CLIENT = Symbol("ES_CLIENT");

@Module({
  providers: [{ provide: ES_CLIENT, useFactory: getEsClient }],
  exports: [ES_CLIENT],
})
export class SearchInfraModule {}
