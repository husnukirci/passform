import { z } from "zod";

import { ErrorResponse } from "./errors.ts";

export const OrderStatus = z.enum(["placed", "confirmed", "expired"]);
export type OrderStatus = z.infer<typeof OrderStatus>;

const OrderLineBody = z.object({
  partId: z.string().min(1),
  qty: z.number().int().min(1),
});

/** Sent with an `Idempotency-Key` header; the same body under the same key replays the order. */
export const CreateOrderBody = z.object({
  lines: z
    .array(OrderLineBody)
    .min(1)
    .refine(
      (lines) => new Set(lines.map((line) => line.partId)).size === lines.length,
      "partId must be unique across lines",
    ),
});
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

export const OrderLineDto = z.object({
  partId: z.string(),
  sku: z.string(),
  name: z.string(),
  qty: z.number().int(),
  /** The price at the moment the order was placed. */
  unitCents: z.number().int(),
});
export type OrderLineDto = z.infer<typeof OrderLineDto>;

export const OrderResponse = z.object({
  id: z.string(),
  status: OrderStatus,
  totalCents: z.number().int(),
  lines: z.array(OrderLineDto),
  /** When the stock reservation lapses unless the order is confirmed first. */
  expiresAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
});
export type OrderResponse = z.infer<typeof OrderResponse>;

/** A `409` for insufficient stock names the part that ran out. */
export const OrderErrorResponse = ErrorResponse.extend({ sku: z.string().optional() });
export type OrderErrorResponse = z.infer<typeof OrderErrorResponse>;
