import { Controller, Get, Param, Query } from "@nestjs/common";
import { CategoriesResponse, PartDetailResponse } from "@passform/contracts";
import { ZodSerializerDto } from "nestjs-zod";

import { PartDetailQueryDto } from "./catalog.dto.js";
import { CatalogService } from "./catalog.service.js";

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  @ZodSerializerDto(CategoriesResponse)
  categories(): Promise<CategoriesResponse> {
    return this.catalog.categoryTree();
  }

  @Get("parts/:sku")
  @ZodSerializerDto(PartDetailResponse)
  part(@Param("sku") sku: string, @Query() query: PartDetailQueryDto): Promise<PartDetailResponse> {
    return this.catalog.partDetail(sku, query);
  }
}
