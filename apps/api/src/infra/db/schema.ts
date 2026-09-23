// Postgres schema, the source of truth (ADR 2, ADR 6). Column names are
// snake_case; the domain never sees them (see mappers.ts). Build dates are
// `YYYY-MM` strings stored as char(7), money is integer cents.

import type { OrderResponse } from "@passform/contracts";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const FUELS = ["petrol", "diesel", "hybrid", "electric"] as const;
export const AXLES = ["front", "rear"] as const;
export const BRAND_TIERS = ["oe", "premium", "standard"] as const;
export const IMPORT_STATUSES = ["queued", "running", "completed", "partial", "failed"] as const;
export const CHUNK_STATUSES = ["pending", "done", "failed"] as const;
export const ORDER_STATUSES = ["placed", "confirmed", "expired"] as const;

export type PartAttributes = Record<string, string | number>;

/** `imports.error`: why the split or the index rebuild failed. */
export interface ImportError {
  message: string;
}

/** One rejected row: its 0-based index in the import file and every problem found. */
export interface InvalidRow {
  row: number;
  errors: string[];
}

/**
 * `import_chunks.error`: the rows a chunk rejected (capped, with the full
 * count) and, when the chunk itself failed, the last error message.
 */
export interface ChunkReport {
  message: string | null;
  invalidRowCount: number;
  invalidRows: InvalidRow[];
}

export const vehicleVariants = pgTable(
  "vehicle_variants",
  {
    id: text("id").primaryKey(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    engineCode: text("engine_code").notNull(),
    kw: integer("kw").notNull(),
    fuel: text("fuel", { enum: FUELS }).notNull(),
    buildFrom: char("build_from", { length: 7 }).notNull(),
    buildTo: char("build_to", { length: 7 }),
    equipment: text("equipment")
      .array()
      .notNull()
      .default(sql`'{}'`),
    keyManufacturer: char("key_manufacturer", { length: 4 }).notNull(),
    keyType: char("key_type", { length: 3 }).notNull(),
  },
  (t) => [
    // Deliberately not unique: one registration key may resolve to several
    // variants, and the customer disambiguates.
    index("vehicle_variants_key_idx").on(t.keyManufacturer, t.keyType),
    index("vehicle_variants_make_model_idx").on(t.make, t.model),
  ],
);

export const categories = pgTable("categories", {
  /** The slug, e.g. `brakes/pads`. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id").references((): AnyPgColumn => categories.id),
});

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const parts = pgTable(
  "parts",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull().unique(),
    brand: text("brand").notNull(),
    brandTier: text("brand_tier", { enum: BRAND_TIERS }).notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    oeRef: text("oe_ref").notNull(),
    attributes: jsonb("attributes").$type<PartAttributes>().notNull().default({}),
    priceCents: integer("price_cents").notNull(),
    stockQty: integer("stock_qty").notNull().default(0),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    universal: boolean("universal").notNull().default(false),
  },
  (t) => [
    check("parts_stock_qty_check", sql`${t.stockQty} >= 0`),
    index("parts_brand_idx").on(t.brand),
    index("parts_category_id_idx").on(t.categoryId),
    index("parts_supplier_id_idx").on(t.supplierId),
  ],
);

export const fitments = pgTable(
  "fitments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    partId: text("part_id")
      .notNull()
      .references(() => parts.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => vehicleVariants.id),
    buildFrom: char("build_from", { length: 7 }),
    buildTo: char("build_to", { length: 7 }),
    axle: text("axle", { enum: AXLES }),
    equipmentCode: text("equipment_code"),
  },
  (t) => [
    index("fitments_variant_id_idx").on(t.variantId),
    index("fitments_part_id_idx").on(t.partId),
  ],
);

export const imports = pgTable("imports", {
  id: text("id").primaryKey(),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  status: text("status", { enum: IMPORT_STATUSES }).notNull(),
  filePath: text("file_path").notNull(),
  totalRows: integer("total_rows").notNull(),
  processedRows: integer("processed_rows").notNull().default(0),
  failedRows: integer("failed_rows").notNull().default(0),
  chunkSize: integer("chunk_size").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: jsonb("error").$type<ImportError>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importChunks = pgTable(
  "import_chunks",
  {
    importId: text("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    status: text("status", { enum: CHUNK_STATUSES }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    rowFrom: integer("row_from").notNull(),
    rowTo: integer("row_to").notNull(),
    error: jsonb("error").$type<ChunkReport>(),
  },
  (t) => [primaryKey({ columns: [t.importId, t.seq] })],
);

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  /** sha256 of the canonical, key-sorted JSON body. */
  payloadHash: text("payload_hash").notNull(),
  status: text("status", { enum: ORDER_STATUSES }).notNull(),
  totalCents: integer("total_cents").notNull(),
  /** The stored response body, replayed on an idempotent retry. */
  response: jsonb("response").$type<OrderResponse>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const orderLines = pgTable(
  "order_lines",
  {
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    partId: text("part_id")
      .notNull()
      .references(() => parts.id),
    /** 0-based index in the request, so the order reads back in the order it was placed. */
    position: integer("position").notNull(),
    qty: integer("qty").notNull(),
    unitCents: integer("unit_cents").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.partId] }),
    check("order_lines_qty_check", sql`${t.qty} >= 1`),
  ],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    partId: text("part_id")
      .notNull()
      .references(() => parts.id),
    qty: integer("qty").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    // The release job scans only open reservations.
    index("stock_reservations_open_expires_at_idx")
      .on(t.expiresAt)
      .where(sql`${t.releasedAt} is null`),
  ],
);
