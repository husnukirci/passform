import { ExpressAdapter } from "@bull-board/express";
import { BullBoardModule } from "@bull-board/nestjs";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";

import { CatalogModule } from "./catalog/catalog.module.js";
import { HealthController } from "./health/health.controller.js";
import { ImportsModule } from "./imports/imports.module.js";
import { ErrorFilter } from "./infra/http/error.filter.js";
import { OrdersModule } from "./orders/orders.module.js";
import { SearchModule } from "./search/search.module.js";
import { StockModule } from "./stock/stock.module.js";
import { VehiclesModule } from "./vehicles/vehicles.module.js";

@Module({
  imports: [
    VehiclesModule,
    CatalogModule,
    SearchModule,
    ImportsModule,
    OrdersModule,
    StockModule,
    // The queue dashboard; unauthenticated by design in this local-first stack (ADR 12).
    BullBoardModule.forRoot({ route: "/admin/queues", adapter: ExpressAdapter }),
  ],
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
