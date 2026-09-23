import { SearchQuery } from "@passform/contracts";
import { createZodDto } from "nestjs-zod";

export class SearchQueryDto extends createZodDto(SearchQuery) {}
