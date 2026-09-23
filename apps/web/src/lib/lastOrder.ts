import { CreateOrderBody } from "@passform/contracts";
import { z } from "zod";

/**
 * The last order request this tab sent, kept so the order page can send the
 * identical body under the identical key and show that one order comes back.
 */

export const LAST_ORDER_KEY = "pf_last_order";

export const LastOrder = z.object({
  orderId: z.string(),
  key: z.string(),
  body: CreateOrderBody,
  /** The HTTP status the cart's own request got: 201, or 200 if it was itself a retry. */
  status: z.number().int(),
});
export type LastOrder = z.infer<typeof LastOrder>;

export function readLastOrder(): LastOrder | null {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    if (raw === null) return null;
    const parsed = LastOrder.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeLastOrder(record: LastOrder): void {
  try {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(record));
  } catch {
    // Private mode or blocked storage: the order still exists, only "send again" is unavailable.
  }
}
