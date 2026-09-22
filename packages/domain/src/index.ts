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
} from "./types.js";
export { DomainError } from "./types.js";

export { compareYearMonth, isYearMonth, withinWindow } from "./yearMonth.js";

export { parseRegistrationKey, resolveVariants, variantLabel } from "./vehicleKey.js";

export { evaluateFit } from "./fit.js";

export type { SearchBody, SearchInput, SearchSort } from "./searchQuery.js";
export { BOOSTS, buildSearchQuery, PAGE_SIZE } from "./searchQuery.js";

export {
  canonicalJson,
  isIdempotencyKey,
  lineTotalCents,
  orderTotalCents,
  RESERVATION_TTL_MINUTES,
  reservationExpiresAt,
} from "./orders.js";

export type { ChunkRange, ImportRow, RowValidation } from "./importRows.js";
export { CHUNK_SIZE, chunkRanges, validateImportRow } from "./importRows.js";
