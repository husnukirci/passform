// Turns the raw lines of one chunk file into rows the repository can
// upsert. Pure: the processor reads the file and asks Postgres which
// references exist; nothing here touches either. Problems are collected per
// row and never thrown, because a rejected row is a normal outcome of an
// import while a failed chunk is not (ADR 8).

import { type ImportRow, validateImportRow } from "@passform/domain";

import type { InvalidRow } from "../infra/db/schema.js";

export interface CandidateRow {
  /** 0-based index in the import file, so a report line can be found again. */
  row: number;
  data: ImportRow;
}

export interface ParsedChunk {
  valid: CandidateRow[];
  invalid: InvalidRow[];
}

export interface KnownReferences {
  categories: ReadonlySet<string>;
  variants: ReadonlySet<string>;
}

export interface PreparedChunk {
  /** One row per SKU; when a chunk repeats a SKU the later row wins. */
  rows: ImportRow[];
  /** Rows that passed, counting each repeated SKU once per occurrence. */
  accepted: number;
  invalid: InvalidRow[];
}

/** Parses and validates every line with the domain rules; shape problems only. */
export function parseChunk(lines: readonly string[], rowFrom: number): ParsedChunk {
  const valid: CandidateRow[] = [];
  const invalid: InvalidRow[] = [];
  lines.forEach((line, i) => {
    const row = rowFrom + i;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      invalid.push({ row, errors: ["row: not valid JSON"] });
      return;
    }
    const verdict = validateImportRow(raw);
    if (verdict.ok) valid.push({ row, data: verdict.row });
    else invalid.push({ row, errors: verdict.errors });
  });
  return { valid, invalid };
}

/** Every category slug and variant id the valid rows point at, each once. */
export function referencedIds(valid: readonly CandidateRow[]): {
  categorySlugs: string[];
  variantIds: string[];
} {
  const categorySlugs = new Set<string>();
  const variantIds = new Set<string>();
  for (const { data } of valid) {
    categorySlugs.add(data.categorySlug);
    for (const fitment of data.fitments) variantIds.add(fitment.variantId);
  }
  return { categorySlugs: [...categorySlugs], variantIds: [...variantIds] };
}

/**
 * Rejects rows that point at a category or variant Postgres does not have,
 * then collapses repeated SKUs so one upsert statement never touches the
 * same row twice.
 */
export function checkReferences(
  { valid, invalid }: ParsedChunk,
  known: KnownReferences,
): PreparedChunk {
  const rejected: InvalidRow[] = [];
  const bySku = new Map<string, ImportRow>();
  let accepted = 0;

  for (const { row, data } of valid) {
    const errors: string[] = [];
    if (!known.categories.has(data.categorySlug)) {
      errors.push(`categorySlug: unknown category "${data.categorySlug}"`);
    }
    data.fitments.forEach((fitment, i) => {
      if (!known.variants.has(fitment.variantId)) {
        errors.push(`fitments[${i}].variantId: unknown variant "${fitment.variantId}"`);
      }
    });
    if (errors.length > 0) {
      rejected.push({ row, errors });
      continue;
    }
    accepted += 1;
    bySku.set(data.sku, data);
  }

  return {
    rows: [...bySku.values()],
    accepted,
    invalid: [...invalid, ...rejected].sort((a, b) => a.row - b.row),
  };
}
