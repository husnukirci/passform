import { Client } from "@elastic/elasticsearch";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

import { closeEsClient } from "./es.client.js";
import { ES_CLIENT, SearchInfraModule } from "./search-infra.module.js";

describe("SearchInfraModule", () => {
  afterEach(async () => {
    await closeEsClient();
  });

  it("provides the shared client without connecting", async () => {
    process.env.ELASTICSEARCH_URL = "http://elasticsearch.invalid:9200";
    const moduleRef = await Test.createTestingModule({ imports: [SearchInfraModule] }).compile();

    expect(moduleRef.get(ES_CLIENT)).toBeInstanceOf(Client);
  });
});
