import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { SearchInfraModule } from "../search/search-infra.module.js";
import { StockController } from "./stock.controller.js";
import { StockService } from "./stock.service.js";

@Module({
  imports: [CatalogModule, SearchInfraModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
