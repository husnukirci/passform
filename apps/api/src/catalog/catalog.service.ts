import { Injectable, NotFoundException } from "@nestjs/common";
import type { CategoriesResponse, PartDetailQuery, PartDetailResponse } from "@passform/contracts";
import { evaluateFit } from "@passform/domain";

import { VehiclesRepository } from "../vehicles/vehicles.repository.js";
import { CategoriesRepository } from "./categories.repository.js";
import { PartsRepository } from "./parts.repository.js";

@Injectable()
export class CatalogService {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly parts: PartsRepository,
    private readonly vehicles: VehiclesRepository,
  ) {}

  async categoryTree(): Promise<CategoriesResponse> {
    return { categories: await this.categories.tree() };
  }

  /** Fit is evaluated only when a variant is named; the detail page has no axle choice. */
  async partDetail(sku: string, { variantId }: PartDetailQuery): Promise<PartDetailResponse> {
    const record = await this.parts.findBySku(sku);
    if (record === null) throw new NotFoundException(`part ${sku} not found`);
    const { part, categoryPath, fitments } = record;

    let fit: PartDetailResponse["fit"] = null;
    if (variantId !== undefined) {
      const variant = await this.vehicles.findById(variantId);
      if (variant === null) throw new NotFoundException(`vehicle ${variantId} not found`);
      fit = evaluateFit(variant, part, fitments, null);
    }
    return { ...part, categoryPath, fit, fitments };
  }
}
