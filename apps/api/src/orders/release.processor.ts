// The compensation path for an abandoned checkout (ADR 10): a repeatable
// job that expires `placed` orders whose reservation has lapsed and gives
// the stock back. One scheduler exists however many API processes start,
// because the scheduler id is fixed; running it twice in a row is a no-op
// because the selection and the release are one conditional transaction.

import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, type OnApplicationBootstrap } from "@nestjs/common";
import type { Queue } from "bullmq";

import { RESERVATIONS_RELEASE } from "../infra/queues.js";
import { OrdersRepository, type ReleaseResult } from "./orders.repository.js";

export const RELEASE_EVERY_MS = 60_000;

@Processor(RESERVATIONS_RELEASE)
export class ReleaseProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReleaseProcessor.name);

  constructor(
    private readonly orders: OrdersRepository,
    @InjectQueue(RESERVATIONS_RELEASE) private readonly queue: Queue,
  ) {
    super();
  }

  /** Upserting the same scheduler id replaces rather than adds, so one schedule exists. */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RESERVATIONS_RELEASE,
      { every: RELEASE_EVERY_MS },
      { name: "release" },
    );
  }

  /** The job carries no data: the work is whatever has expired by now. */
  async process(): Promise<ReleaseResult> {
    const result = await this.orders.releaseExpired();
    if (result.orders > 0) {
      this.logger.log(`expired ${result.orders} orders, released ${result.reservations} lines`);
    }
    return result;
  }
}
