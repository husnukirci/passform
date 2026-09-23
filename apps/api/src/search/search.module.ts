import { Module } from "@nestjs/common";

import { VehiclesModule } from "../vehicles/vehicles.module.js";
import { SearchInfraModule } from "./search-infra.module.js";
import { SearchController } from "./search.controller.js";
import { SearchService } from "./search.service.js";

@Module({
  imports: [SearchInfraModule, VehiclesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
