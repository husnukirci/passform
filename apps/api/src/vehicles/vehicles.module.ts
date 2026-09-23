import { Module } from "@nestjs/common";

import { DbModule } from "../infra/db/db.module.js";
import { VehiclesController } from "./vehicles.controller.js";
import { VehiclesRepository } from "./vehicles.repository.js";
import { VehiclesService } from "./vehicles.service.js";

@Module({
  imports: [DbModule],
  controllers: [VehiclesController],
  providers: [VehiclesRepository, VehiclesService],
  exports: [VehiclesRepository],
})
export class VehiclesModule {}
