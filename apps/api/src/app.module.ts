import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";

import { CatalogModule } from "./catalog/catalog.module.js";
import { HealthController } from "./health/health.controller.js";
import { ErrorFilter } from "./infra/http/error.filter.js";
import { VehiclesModule } from "./vehicles/vehicles.module.js";

@Module({
  imports: [VehiclesModule, CatalogModule],
  controllers: [HealthController],
  providers: [
    // Registered here rather than in main.ts so the testing module gets the
    // same pipeline as the running app.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
