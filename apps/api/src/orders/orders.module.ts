import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BullBoardModule } from "@bull-board/nestjs";
import { Module } from "@nestjs/common";

import { DbModule } from "../infra/db/db.module.js";
import { QueuesModule, RESERVATIONS_RELEASE } from "../infra/queues.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersRepository } from "./orders.repository.js";
import { OrdersService } from "./orders.service.js";
import { ReleaseProcessor } from "./release.processor.js";

@Module({
  imports: [
    DbModule,
    QueuesModule,
    BullBoardModule.forFeature({ name: RESERVATIONS_RELEASE, adapter: BullMQAdapter }),
  ],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService, ReleaseProcessor],
})
export class OrdersModule {}
