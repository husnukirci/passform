import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";

import { HealthController } from "./health/health.controller.js";

@Module({
  controllers: [HealthController],
  providers: [
    // Registered here rather than in main.ts so the testing module gets the
    // same pipeline as the running app.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
