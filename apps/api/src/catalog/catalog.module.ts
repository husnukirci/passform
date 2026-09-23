import { Module } from "@nestjs/common";

import { DbModule } from "../infra/db/db.module.js";
import { VehiclesModule } from "../vehicles/vehicles.module.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { CategoriesRepository } from "./categories.repository.js";
import { PartsRepository } from "./parts.repository.js";

@Module({
  imports: [DbModule, VehiclesModule],
  controllers: [CatalogController],
  providers: [CategoriesRepository, PartsRepository, CatalogService],
})
export class CatalogModule {}
