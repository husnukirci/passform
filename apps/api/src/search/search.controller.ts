import { Controller, Get, Query } from "@nestjs/common";
import { SearchResponse } from "@passform/contracts";
import { ZodSerializerDto } from "nestjs-zod";

import { SearchQueryDto } from "./search.dto.js";
import { SearchService } from "./search.service.js";

@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ZodSerializerDto(SearchResponse)
  get(@Query() query: SearchQueryDto): Promise<SearchResponse> {
    return this.search.search(query);
  }
}
