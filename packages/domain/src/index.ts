// Public surface of the domain core. Re-exports only; the rules live in
// their own modules and are tested there.

export type {
  Axle,
  BrandTier,
  FitResult,
  Fitment,
  Fuel,
  OrderLineInput,
  Part,
  RegistrationKey,
  VehicleVariant,
  YearMonth,
} from "./types.ts";
export { DomainError } from "./types.ts";

export { compareYearMonth, isYearMonth, withinWindow } from "./yearMonth.ts";

export { parseRegistrationKey, resolveVariants, variantLabel } from "./vehicleKey.ts";

export { evaluateFit } from "./fit.ts";

export type { SearchBody, SearchInput, SearchSort } from "./searchQuery.ts";
export { BOOSTS, buildSearchQuery, PAGE_SIZE } from "./searchQuery.ts";

export {
  canonicalJson,
  isIdempotencyKey,
  lineTotalCents,
  orderTotalCents,
  RESERVATION_TTL_MINUTES,
  reservationExpiresAt,
} from "./orders.ts";

export { availableStock } from "./stock.ts";

export type { ChunkRange, ImportRow, RowValidation } from "./importRows.ts";
export { CHUNK_SIZE, chunkRanges, validateImportRow } from "./importRows.ts";
