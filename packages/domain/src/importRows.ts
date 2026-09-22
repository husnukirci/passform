import { type Axle, type BrandTier, DomainError, type Fitment } from "./types.ts";
import { isYearMonth } from "./yearMonth.ts";

export interface ImportRow {
  sku: string;
  brand: string;
  brandTier: BrandTier;
  categorySlug: string;
  name: string;
  oeRef: string;
  attributes: Record<string, string | number>;
  priceCents: number;
  stockQty: number;
  universal: boolean;
  fitments: Fitment[];
}

export type RowValidation = { ok: true; row: ImportRow } | { ok: false; errors: string[] };

export const CHUNK_SIZE = 1000;

/** 0-based row range, `rowTo` exclusive. `seq` is the chunk's identity within an import. */
export interface ChunkRange {
  seq: number;
  rowFrom: number;
  rowTo: number;
}

const BRAND_TIERS: readonly BrandTier[] = ["oe", "premium", "standard"];
const AXLES: readonly Axle[] = ["front", "rear"];

/**
 * Hand-written validation of one supplier row. Every problem is collected as
 * `"<field>: <problem>"` so a rejected row can be fixed in one pass. The
 * returned row is a fresh object built only from the accepted fields.
 */
export function validateImportRow(raw: unknown): RowValidation {
  if (!isRecord(raw)) {
    return { ok: false, errors: ["row: expected an object"] };
  }

  const problems = new Problems();
  const row: ImportRow = {
    sku: problems.require(nonEmptyString(raw.sku), "", "sku: expected a non-empty string"),
    brand: problems.require(nonEmptyString(raw.brand), "", "brand: expected a non-empty string"),
    brandTier: problems.require(
      oneOf(BRAND_TIERS, raw.brandTier),
      "standard",
      "brandTier: expected one of oe, premium, standard",
    ),
    categorySlug: problems.require(
      nonEmptyString(raw.categorySlug),
      "",
      "categorySlug: expected a non-empty string",
    ),
    name: problems.require(nonEmptyString(raw.name), "", "name: expected a non-empty string"),
    oeRef: problems.require(string(raw.oeRef), "", "oeRef: expected a string"),
    attributes: problems.require(
      attributeMap(raw.attributes),
      {},
      "attributes: expected an object of string or number values",
    ),
    priceCents: problems.require(
      nonNegativeInteger(raw.priceCents),
      0,
      "priceCents: expected an integer of at least 0",
    ),
    stockQty: problems.require(
      nonNegativeInteger(raw.stockQty),
      0,
      "stockQty: expected an integer of at least 0",
    ),
    universal: problems.require(boolean(raw.universal), false, "universal: expected a boolean"),
    fitments: validateFitments(raw.fitments, problems),
  };

  if (row.universal && row.fitments.length > 0) {
    problems.add("fitments: expected none for a universal row");
  }

  return problems.errors.length === 0 ? { ok: true, row } : { ok: false, errors: problems.errors };
}

function validateFitments(raw: unknown, problems: Problems): Fitment[] {
  if (!Array.isArray(raw)) {
    problems.add("fitments: expected an array");
    return [];
  }

  const fitments: Fitment[] = [];
  raw.forEach((entry: unknown, index) => {
    const at = `fitments[${index}]`;
    if (!isRecord(entry)) {
      problems.add(`${at}: expected an object`);
      return;
    }

    const before = problems.errors.length;
    const fitment: Fitment = {
      variantId: problems.require(
        nonEmptyString(entry.variantId),
        "",
        `${at}.variantId: expected a non-empty string`,
      ),
      buildFrom: problems.require(
        yearMonthOrNull(entry.buildFrom),
        null,
        `${at}.buildFrom: expected YYYY-MM or null`,
      ),
      buildTo: problems.require(
        yearMonthOrNull(entry.buildTo),
        null,
        `${at}.buildTo: expected YYYY-MM or null`,
      ),
      axle: problems.require(
        entry.axle === null ? null : oneOf(AXLES, entry.axle),
        null,
        `${at}.axle: expected front, rear or null`,
      ),
      equipmentCode: problems.require(
        entry.equipmentCode === null ? null : string(entry.equipmentCode),
        null,
        `${at}.equipmentCode: expected a string or null`,
      ),
    };
    if (problems.errors.length === before) fitments.push(fitment);
  });

  return fitments;
}

/**
 * Collects problems instead of throwing. `require` hands back a typed
 * fallback for a rejected value so the row literal stays fully typed; the
 * row is only returned when no problem was recorded.
 */
class Problems {
  readonly errors: string[] = [];

  add(problem: string): void {
    this.errors.push(problem);
  }

  require<T>(value: T | undefined, fallback: T, problem: string): T {
    if (value === undefined) {
      this.add(problem);
      return fallback;
    }
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function yearMonthOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && isYearMonth(value) ? value : undefined;
}

function attributeMap(value: unknown): Record<string, string | number> | undefined {
  if (!isRecord(value)) return undefined;
  const attributes: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" && typeof entry !== "number") return undefined;
    attributes[key] = entry;
  }
  return attributes;
}

/** Splits `totalRows` into consecutive `[rowFrom, rowTo)` ranges of at most `chunkSize`. */
export function chunkRanges(totalRows: number, chunkSize: number = CHUNK_SIZE): ChunkRange[] {
  if (!Number.isInteger(totalRows) || totalRows < 0) {
    throw new DomainError(`totalRows: expected an integer of at least 0, got ${totalRows}`);
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new DomainError(`chunkSize: expected an integer of at least 1, got ${chunkSize}`);
  }

  const ranges: ChunkRange[] = [];
  for (let rowFrom = 0, seq = 0; rowFrom < totalRows; rowFrom += chunkSize, seq += 1) {
    ranges.push({ seq, rowFrom, rowTo: Math.min(rowFrom + chunkSize, totalRows) });
  }
  return ranges;
}
