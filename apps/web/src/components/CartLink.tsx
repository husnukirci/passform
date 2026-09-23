"use client";

import Link from "next/link";

import { useHydrated } from "@/lib/useHydrated";
import { useCartStore } from "@/state/cartStore";

/** The cart lives in localStorage, so the count appears only after hydration. */
export function CartLink() {
  const hydrated = useHydrated();
  const count = useCartStore((state) =>
    Object.values(state.lines).reduce((sum, line) => sum + line.qty, 0),
  );

  return (
    <Link href="/cart" className="hover:underline">
      Cart{hydrated && count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
