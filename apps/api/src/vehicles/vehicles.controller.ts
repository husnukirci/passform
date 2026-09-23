import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  MakesResponse,
  ModelsResponse,
  ResolveVehicleResponse,
  VariantsResponse,
  VehicleVariantDto,
} from "@passform/contracts";
import { ZodSerializerDto } from "nestjs-zod";

import { ModelsQueryDto, ResolveVehicleQueryDto, VariantsQueryDto } from "./vehicles.dto.js";
import { VehiclesService } from "./vehicles.service.js";

// The literal routes are declared before `:id` so they win the match.
@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get("resolve")
  @ZodSerializerDto(ResolveVehicleResponse)
  resolve(@Query() query: ResolveVehicleQueryDto): Promise<ResolveVehicleResponse> {
    return this.vehicles.resolve(query);
  }

  @Get("makes")
  @ZodSerializerDto(MakesResponse)
  makes(): Promise<MakesResponse> {
    return this.vehicles.makes();
  }

  @Get("models")
  @ZodSerializerDto(ModelsResponse)
  models(@Query() query: ModelsQueryDto): Promise<ModelsResponse> {
    return this.vehicles.models(query);
  }

  @Get()
  @ZodSerializerDto(VariantsResponse)
  variants(@Query() query: VariantsQueryDto): Promise<VariantsResponse> {
    return this.vehicles.variants(query);
  }

  @Get(":id")
  @ZodSerializerDto(VehicleVariantDto)
  byId(@Param("id") id: string): Promise<VehicleVariantDto> {
    return this.vehicles.getById(id);
  }
}
