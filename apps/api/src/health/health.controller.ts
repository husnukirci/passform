import { Controller, Get } from "@nestjs/common";
import { HealthResponse } from "@passform/contracts";
import { ZodSerializerDto } from "nestjs-zod";

@Controller("health")
export class HealthController {
  @Get()
  @ZodSerializerDto(HealthResponse)
  health(): HealthResponse {
    return { ok: true };
  }
}
