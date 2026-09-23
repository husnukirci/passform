// Every request and response body, one file per resource. The API validates
// with these schemas; the web app infers its types from them (ADR 13).

export { Axle, BrandTier, FitDto, Fuel, YearMonth } from "./common.ts";
export { HealthResponse } from "./health.ts";
export { ErrorResponse } from "./errors.ts";
export {
  MakesResponse,
  ModelsQuery,
  ModelsResponse,
  ResolveVehicleQuery,
  ResolveVehicleResponse,
  VariantsQuery,
  VariantsResponse,
  VehicleVariantDto,
} from "./vehicles.ts";
export { CategoriesResponse, CategoryNode } from "./categories.ts";
export { FitmentDto, PartDetailQuery, PartDetailResponse, PartDto } from "./parts.ts";
export { SearchHitDto, SearchQuery, SearchResponse, SearchSort } from "./search.ts";
