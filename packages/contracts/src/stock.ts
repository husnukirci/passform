import { z } from "zod";

/** The most rows one request carries; a supplier sends a larger delta in several calls. */
export const STOCK_UPDATE_MAX_ROWS = 1000;

const StockUpdateRow = z
  .object({
    sku: z.string().min(1),
    priceCents: z.number().int().min(0).optional(),
    stockQty: z.number().int().min(0).optional(),
  })
  .refine(
    (row) => row.priceCents !== undefined || row.stockQty !== undefined,
    "expected priceCents or stockQty",
  );

/**
 * A supplier's price-and-stock delta for `PATCH /suppliers/:id/stock`. Values
 * are absolute, so the same body sent twice leaves the same state (ADR 11).
 */
export const StockUpdateBody = z.object({
  rows: z
    .array(StockUpdateRow)
    .min(1)
    .max(STOCK_UPDATE_MAX_ROWS)
    .refine(
      (rows) => new Set(rows.map((row) => row.sku)).size === rows.length,
      "sku must be unique across rows",
    ),
});
export type StockUpdateBody = z.infer<typeof StockUpdateBody>;

export const StockUpdateResponse = z.object({
  /** Rows that matched a part of this supplier and were written. */
  updated: z.number().int(),
  /** SKUs that do not exist or belong to another supplier; not an error. */
  unknown: z.array(z.string()),
  /** False when Postgres committed but the index patch failed; the next rebuild repairs it. */
  indexed: z.boolean(),
});
export type StockUpdateResponse = z.infer<typeof StockUpdateResponse>;
