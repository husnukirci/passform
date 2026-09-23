"use client";

import { type CreateOrderBody, OrderResponse } from "@passform/contracts";
import { lineTotalCents, orderTotalCents } from "@passform/domain";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiRequest, errorMessage, jsonInit } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { writeLastOrder } from "@/lib/lastOrder";
import { useHydrated } from "@/lib/useHydrated";
import { cartLines, useCartStore } from "@/state/cartStore";

export function CartView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const lineMap = useCartStore((state) => state.lines);
  const pendingKey = useCartStore((state) => state.pendingKey);
  const { setQty, remove, clear, ensurePendingKey } = useCartStore.getState();
  const lines = cartLines(lineMap);

  const placeOrder = useMutation({
    mutationFn: async () => {
      // One key per cart: a retry of this request, from here or from the order page, replays it.
      const key = ensurePendingKey();
      const body: CreateOrderBody = {
        lines: lines.map((line) => ({ partId: line.partId, qty: line.qty })),
      };
      const result = await apiRequest(
        "/orders",
        OrderResponse,
        jsonInit(body, { "Idempotency-Key": key }),
      );
      return { key, body, ...result };
    },
    onSuccess: ({ key, body, status, data }) => {
      writeLastOrder({ orderId: data.id, key, body, status });
      clear();
      router.push(`/orders/${encodeURIComponent(data.id)}`);
    },
  });

  if (!hydrated) {
    return (
      <p className="text-sm text-muted" aria-busy="true">
        Loading cart…
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm">
        <p>Your cart is empty.</p>
        <Link href="/parts" className="mt-2 inline-block text-link underline">
          Find parts that fit
        </Link>
      </div>
    );
  }

  const total = orderTotalCents(lines);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                Part
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Unit price
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Qty
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Line total
              </th>
              <th scope="col" className="py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.partId} className="border-b border-border">
                <td className="py-2 pr-4">
                  <Link
                    href={`/parts/${encodeURIComponent(line.sku)}`}
                    className="font-medium hover:underline"
                  >
                    {line.name}
                  </Link>
                  <p className="font-mono text-xs text-muted">{line.sku}</p>
                </td>
                <td className="py-2 pr-4">{formatEur(line.unitCents)}</td>
                <td className="py-2 pr-4">
                  <label className="sr-only" htmlFor={`qty-${line.partId}`}>
                    Quantity for {line.name}
                  </label>
                  <input
                    id={`qty-${line.partId}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={line.stockQty}
                    value={line.qty}
                    onChange={(event) => setQty(line.partId, Number(event.target.value))}
                    className="w-20 rounded border border-border bg-background px-2 py-1"
                  />
                  <span className="ml-2 text-xs text-muted">of {line.stockQty}</span>
                </td>
                <td className="py-2 pr-4 text-right font-medium">
                  {formatEur(lineTotalCents(line))}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(line.partId)}
                    className="text-link underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="py-3 pr-4 text-right font-semibold">
                Total
              </th>
              <td className="py-3 pr-4 text-right text-lg font-semibold">{formatEur(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <button
          type="button"
          onClick={() => placeOrder.mutate()}
          disabled={placeOrder.isPending}
          className="rounded bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60"
        >
          {placeOrder.isPending ? "Placing order…" : "Place order"}
        </button>
        <p className="text-muted">
          Stock is reserved for 15 minutes; confirm the order on the next page to keep it.
        </p>
        {pendingKey && (
          <p className="basis-full font-mono text-xs text-muted">Idempotency-Key {pendingKey}</p>
        )}
        {placeOrder.isError && (
          <p role="alert" className="basis-full text-fit-no">
            {errorMessage(placeOrder.error)}
          </p>
        )}
      </div>
    </div>
  );
}
