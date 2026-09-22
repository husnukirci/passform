import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  MakesResponse,
  ModelsQuery,
  ModelsResponse,
  ResolveVehicleQuery,
  ResolveVehicleResponse,
  VariantsQuery,
  VariantsResponse,
  VehicleVariantDto,
} from "@passform/contracts";
import { parseRegistrationKey, resolveVariants } from "@passform/domain";

import { toVariantDto } from "./vehicles.dto.js";
import { VehiclesRepository } from "./vehicles.repository.js";

@Injectable()
export class VehiclesService {
  constructor(private readonly vehicles: VehiclesRepository) {}

  /** A malformed key throws `DomainError`, which the error filter turns into a 400. */
  async resolve(input: ResolveVehicleQuery): Promise<ResolveVehicleResponse> {
    const key = parseRegistrationKey(input);
    const candidates = await this.vehicles.findByKey(key);
    const { variants, needsDisambiguation } = resolveVariants(key, candidates);
    return { variants: variants.map(toVariantDto), needsDisambiguation };
  }

  async getById(id: string): Promise<VehicleVariantDto> {
    const variant = await this.vehicles.findById(id);
    if (variant === null) throw new NotFoundException(`vehicle ${id} not found`);
    return toVariantDto(variant);
  }

  async makes(): Promise<MakesResponse> {
    return { makes: await this.vehicles.listMakes() };
  }

  async models({ make }: ModelsQuery): Promise<ModelsResponse> {
    return { make, models: await this.vehicles.listModels(make) };
  }

  async variants({ make, model }: VariantsQuery): Promise<VariantsResponse> {
    const variants = await this.vehicles.listVariants(make, model);
    return { variants: variants.map(toVariantDto) };
  }
}
