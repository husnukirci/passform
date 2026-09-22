import { DomainError, type OrderLineInput } from "./types.js";

export const RESERVATION_TTL_MINUTES = 15;

const MS_PER_MINUTE = 60_000;

// Any version, any variant; the API only needs a well-formed, client-chosen key.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Integer cents in, integer cents out. Nothing here ever rounds. */
export function lineTotalCents(line: OrderLineInput): number {
  assertIntegerAtLeast("qty", line.qty, 1);
  assertIntegerAtLeast("unitCents", line.unitCents, 0);
  return line.qty * line.unitCents;
}

export function orderTotalCents(lines: OrderLineInput[]): number {
  if (lines.length === 0) {
    throw new DomainError("lines: expected at least one line");
  }
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

/**
 * Deterministic serialisation the API hashes to detect a replayed
 * idempotency key with a different payload: keys sorted at every depth, no
 * whitespace, `undefined` properties dropped, array order kept.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === "object" && value !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const nested = (value as Record<string, unknown>)[key];
      if (nested !== undefined) sorted[key] = sortKeys(nested);
    }
    return sorted;
  }
  return value;
}

export function isIdempotencyKey(s: string): boolean {
  return UUID.test(s);
}

export function reservationExpiresAt(placedAt: Date): Date {
  return new Date(placedAt.getTime() + RESERVATION_TTL_MINUTES * MS_PER_MINUTE);
}

function assertIntegerAtLeast(field: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError(`${field}: expected an integer of at least ${min}, got ${value}`);
  }
}
