// One `index.rebuild` job per finished import. The builder verifies the
// document count before it moves the alias (ADR 6), so a failure here leaves
// search answering from the previous index; the import records the reason.

import type { Client } from "@elastic/elasticsearch";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { type Db } from "../infra/db/client.js";
import { DB } from "../infra/db/db.module.js";
import { INDEX_REBUILD, type RebuildJob } from "../infra/queues.js";
import { rebuildIndex, type RebuildResult } from "../search/index-builder.js";
import { ES_CLIENT } from "../search/search-infra.module.js";
import { ImportsRepository } from "./imports.repository.js";

@Processor(INDEX_REBUILD)
export class RebuildProcessor extends WorkerHost {
  private readonly logger = new Logger(RebuildProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ES_CLIENT) private readonly es: Client,
    private readonly imports: ImportsRepository,
  ) {
    super();
  }

  async process(job: Job<RebuildJob>): Promise<RebuildResult> {
    const { importId } = job.data;
    try {
      const result = await rebuildIndex({
        db: this.db,
        es: this.es,
        log: (message) => this.logger.log(`${importId}: ${message}`),
      });
      return result;
    } catch (error) {
      // Verification failures are the expected case; any other error leaves the alias alone too.
      const message = error instanceof Error ? error.message : String(error);
      await this.imports.setError(importId, { message });
      throw error;
    }
  }
}
