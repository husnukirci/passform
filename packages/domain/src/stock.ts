import { DomainError } from "./types.ts";

/**
 * What to store when a supplier reports the stock on its shelf. Units held
 * by open reservations have already been taken off `stock_qty` and come
 * back when the reservation expires, so counting them again would sell them
 * twice. Confirmed orders never give stock back and are not part of
 * `openReservedUnits`.
 */
export function availableStock(reported: number, openReservedUnits: number): number {
  assertNonNegativeInteger("reported", reported);
  assertNonNegativeInteger("openReservedUnits", openReservedUnits);
  return Math.max(0, reported - openReservedUnits);
}

function assertNonNegativeInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError(`${field}: expected an integer of at least 0, got ${value}`);
  }
}
