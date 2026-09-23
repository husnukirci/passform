import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The cart draft. Server state belongs to TanStack Query and the selected
 * vehicle to the URL; this store holds only what the visitor has not sent
 * yet, persisted so a reload keeps the draft.
 */

/** What a line needs from a part; the search hit and the detail both provide it. */
export interface CartPart {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stockQty: number;
}

export interface CartLine {
  partId: string;
  sku: string;
  name: string;
  unitCents: number;
  qty: number;
  /** Kept so quantity edits can be clamped without another request. */
  stockQty: number;
}

export interface CartState {
  variantId: string | null;
  lines: Record<string, CartLine>;
  /** The Idempotency-Key for this cart's order, minted once and reused by every retry. */
  pendingKey: string | null;
  setVariant: (variantId: string | null) => void;
  add: (part: CartPart) => void;
  setQty: (partId: string, qty: number) => void;
  remove: (partId: string) => void;
  clear: () => void;
  ensurePendingKey: () => string;
}

export const CART_STORAGE_KEY = "pf_cart";

function clampQty(qty: number, stockQty: number): number {
  return Math.min(Math.max(Math.floor(qty), 1), stockQty);
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      variantId: null,
      lines: {},
      pendingKey: null,

      setVariant: (variantId) => set({ variantId }),

      add: (part) => {
        if (part.stockQty < 1) return;
        const existing = get().lines[part.id];
        const qty = existing ? clampQty(existing.qty + 1, part.stockQty) : 1;
        set((state) => ({
          lines: {
            ...state.lines,
            [part.id]: {
              partId: part.id,
              sku: part.sku,
              name: part.name,
              unitCents: part.priceCents,
              qty,
              stockQty: part.stockQty,
            },
          },
        }));
      },

      setQty: (partId, qty) => {
        const line = get().lines[partId];
        if (!line) return;
        set((state) => ({
          lines: { ...state.lines, [partId]: { ...line, qty: clampQty(qty, line.stockQty) } },
        }));
      },

      remove: (partId) =>
        set((state) => {
          const { [partId]: _removed, ...lines } = state.lines;
          return { lines };
        }),

      clear: () => set({ lines: {}, pendingKey: null }),

      ensurePendingKey: () => {
        const current = get().pendingKey;
        if (current !== null) return current;
        const pendingKey = crypto.randomUUID();
        set({ pendingKey });
        return pendingKey;
      },
    }),
    { name: CART_STORAGE_KEY },
  ),
);

/** Lines in insertion order, for rendering and for the order body. */
export function cartLines(lines: Record<string, CartLine>): CartLine[] {
  return Object.values(lines);
}
