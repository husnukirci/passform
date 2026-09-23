"use client";

import Link from "next/link";

import { useHydrated } from "@/lib/useHydrated";
import { type CartPart, useCartStore } from "@/state/cartStore";

export function AddToCartButton({ part }: { part: CartPart }) {
  const hydrated = useHydrated();
  const add = useCartStore((state) => state.add);
  const inCart = useCartStore((state) => state.lines[part.id]?.qty ?? 0);
  const soldOut = part.stockQty < 1;
  const atLimit = inCart >= part.stockQty;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => add(part)}
        disabled={!hydrated || soldOut || atLimit}
        className="rounded bg-accent px-4 py-1.5 font-medium text-accent-fg disabled:opacity-60"
      >
        {soldOut ? "Out of stock" : "Add to cart"}
      </button>
      {hydrated && inCart > 0 && (
        <span aria-live="polite">
          {inCart} in cart{atLimit ? " (all the stock there is)" : ""} ·{" "}
          <Link href="/cart" className="text-link underline">
            view cart
          </Link>
        </span>
      )}
    </div>
  );
}
