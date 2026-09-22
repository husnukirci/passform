import { DomainError, type RegistrationKey, type VehicleVariant } from "./types.js";
import { compareYearMonth } from "./yearMonth.js";

const MANUFACTURER = /^\d{4}$/;
const TYPE = /^[A-Z0-9]{3}$/;

/** Trims and uppercases, then validates. Throws naming the offending field. */
export function parseRegistrationKey(input: {
  manufacturer: string;
  type: string;
}): RegistrationKey {
  const manufacturer = input.manufacturer.trim();
  const type = input.type.trim().toUpperCase();

  if (!MANUFACTURER.test(manufacturer)) {
    throw new DomainError("manufacturer: expected exactly 4 digits");
  }
  if (!TYPE.test(type)) {
    throw new DomainError("type: expected exactly 3 characters A-Z or 0-9");
  }
  return { manufacturer, type };
}

/**
 * One key may map to several variants; that is normal and is handled by
 * asking the customer, never by guessing. Candidates are not mutated.
 */
export function resolveVariants(
  key: RegistrationKey,
  candidates: VehicleVariant[],
): { variants: VehicleVariant[]; needsDisambiguation: boolean } {
  const variants = candidates
    .filter((v) => v.key.manufacturer === key.manufacturer && v.key.type === key.type)
    .sort((a, b) => compareYearMonth(a.buildFrom, b.buildFrom) || a.kw - b.kw);

  return { variants, needsDisambiguation: variants.length > 1 };
}

/** The line the customer picks from when a key needs disambiguation. */
export function variantLabel(v: VehicleVariant): string {
  return `${v.engineCode} · ${v.kw} kW · ${v.fuel} · ${v.buildFrom} → ${v.buildTo ?? "today"}`;
}
