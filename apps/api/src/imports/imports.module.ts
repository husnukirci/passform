import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BullBoardModule } from "@bull-board/nestjs";
import { Module } from "@nestjs/common";

import { DbModule } from "../infra/db/db.module.js";
import { IMPORT_CHUNK, IMPORT_CHUNK_DLQ, INDEX_REBUILD, QueuesModule } from "../infra/queues.js";
import { SearchInfraModule } from "../search/search-infra.module.js";
import { ChunkProcessor } from "./chunk.processor.js";
import { ChunkEventsListener, ImportCompletion } from "./completion.js";
import { ImportsController } from "./imports.controller.js";
import { ImportsRepository } from "./imports.repository.js";
import { ImportsService } from "./imports.service.js";
import { RebuildProcessor } from "./rebuild.processor.js";

@Module({
  imports: [
    DbModule,
    SearchInfraModule,
    QueuesModule,
    BullBoardModule.forFeature(
      { name: IMPORT_CHUNK, adapter: BullMQAdapter },
      { name: INDEX_REBUILD, adapter: BullMQAdapter },
      { name: IMPORT_CHUNK_DLQ, adapter: BullMQAdapter },
    ),
  ],
  controllers: [ImportsController],
  providers: [
    ImportsRepository,
    ImportsService,
    ImportCompletion,
    ChunkEventsListener,
    ChunkProcessor,
    RebuildProcessor,
  ],
})
export class ImportsModule {}
