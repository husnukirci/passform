"use client";

import { type OrderResponse, OrderResponse as OrderResponseSchema } from "@passform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { ApiError, apiFetch, apiRequest, errorMessage, jsonInit } from "@/lib/api";
import { formatDateTime, formatEur } from "@/lib/format";
import { readLastOrder } from "@/lib/lastOrder";
import { useHydrated } from "@/lib/useHydrated";

const TONE: Record<OrderResponse["status"], StatusTone> = {
  placed: "warn",
  confirmed: "ok",
  expired: "fail",
};

interface Attempt {
  status: number;
  label: string;
}

export function OrderView({ initial }: { initial: OrderResponse }) {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const queryKey = ["order", initial.id];

  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/orders/${encodeURIComponent(initial.id)}`, OrderResponseSchema),
    initialData: initial,
    // A placed order can expire under us; keep asking until it settles.
    refetchInterval: (current) => (current.state.data?.status === "placed" ? 15_000 : false),
  });
  const order = query.data;

  // The request the cart sent, if this tab sent it; "send again" replays exactly that.
  const last = hydrated ? readLastOrder() : null;
  const replayable = last !== null && last.orderId === order.id ? last : null;
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  const sendAgain = useMutation({
    mutationFn: async () => {
      if (replayable === null) throw new Error("the original request is not in this tab");
      return apiRequest(
        "/orders",
        OrderResponseSchema,
        jsonInit(replayable.body, { "Idempotency-Key": replayable.key }),
      );
    },
    onSuccess: ({ status, data }) => {
      const label = data.id === order.id ? "replayed, same order" : `different order ${data.id}`;
      setAttempts((list) => [...list, { status, label }]);
    },
    onError: (error) => {
      const status = error instanceof ApiError ? error.status : 0;
      setAttempts((list) => [...list, { status, label: errorMessage(error) }]);
    },
  });

  const confirm = useMutation({
    mutationFn: () =>
      apiRequest(`/orders/${encodeURIComponent(order.id)}/confirm`, OrderResponseSchema, {
        method: "POST",
      }),
    onSuccess: ({ data }) => queryClient.setQueryData(queryKey, data),
    onError: () => void query.refetch(),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Order <span className="font-mono">{order.id}</span>
        </h1>
        <StatusBadge tone={TONE[order.status]}>{order.status}</StatusBadge>
      </header>

      {order.status === "placed" && <Countdown expiresAt={order.expiresAt} />}
      {order.status === "confirmed" && order.confirmedAt && (
        <p className="text-sm">
          Confirmed {formatDateTime(order.confirmedAt)}. The stock stays taken.
        </p>
      )}
      {order.status === "expired" && (
        <div className="rounded-lg border border-job-fail-bg bg-surface p-4 text-sm">
          <p>
            This order expired at {formatDateTime(order.expiresAt)}: the stock reservation lapsed
            before the order was confirmed, and the stock went back on sale.
          </p>
          <Link href="/cart" className="mt-2 inline-block text-link underline">
            Back to the cart
          </Link>
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Part
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Qty
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Unit price
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Line total
            </th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.partId} className="border-b border-border">
              <td className="py-2 pr-4">
                {line.name}
                <p className="font-mono text-xs text-muted">{line.sku}</p>
              </td>
              <td className="py-2 pr-4">{line.qty}</td>
              <td className="py-2 pr-4">{formatEur(line.unitCents)}</td>
              <td className="py-2 text-right">{formatEur(line.unitCents * line.qty)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3} className="py-3 pr-4 text-right font-semibold">
              Total
            </th>
            <td className="py-3 text-right text-lg font-semibold">{formatEur(order.totalCents)}</td>
          </tr>
        </tfoot>
      </table>

      <section
        aria-labelledby="replay-heading"
        className="rounded-lg border border-border bg-surface p-4 text-sm"
      >
        <h2 id="replay-heading" className="font-semibold">
          Same request, same key
        </h2>
        <p className="mt-1 text-muted">
          Sends the identical body under the identical Idempotency-Key. The API answers with the
          stored order instead of creating a second one.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => sendAgain.mutate()}
            disabled={replayable === null || sendAgain.isPending}
            className="rounded border border-border bg-background px-4 py-1.5 font-medium hover:border-accent disabled:opacity-60"
          >
            Send again
          </button>
          {hydrated && replayable === null && (
            <span className="text-muted">The original request was not sent from this tab.</span>
          )}
        </div>
        {replayable && (
          <ol className="mt-3 space-y-1 font-mono text-xs" aria-live="polite">
            <li>
              {replayable.status} {replayable.status === 201 ? "created" : "replayed"}
            </li>
            {attempts.map((attempt, index) => (
              <li key={index}>
                {attempt.status || "network"} {attempt.label}
              </li>
            ))}
          </ol>
        )}
      </section>

      {order.status !== "expired" && (
        <section
          aria-labelledby="confirm-heading"
          className="rounded-lg border border-border p-4 text-sm"
        >
          <h2 id="confirm-heading" className="font-semibold">
            Confirm
          </h2>
          <p className="mt-1 text-muted">
            Stands in for payment: a placed order becomes confirmed and keeps its stock.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => confirm.mutate()}
              disabled={confirm.isPending || order.status === "confirmed"}
              className="rounded bg-accent px-4 py-1.5 font-medium text-accent-fg disabled:opacity-60"
            >
              {order.status === "confirmed" ? "Confirmed" : "Confirm order"}
            </button>
            {confirm.isError && (
              <p role="alert" className="text-fit-no">
                {errorMessage(confirm.error)}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** Time left on the reservation, ticking each second once hydrated. */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = new Date(expiresAt).getTime() - now;
  const minutes = Math.floor(Math.max(remainingMs, 0) / 60_000);
  const seconds = Math.floor((Math.max(remainingMs, 0) % 60_000) / 1000);

  return (
    <p className="text-sm" aria-live="off">
      Stock reserved until {formatDateTime(expiresAt)}
      {hydrated && (
        <>
          {" · "}
          {remainingMs > 0 ? (
            <span className="font-mono">
              {minutes}:{String(seconds).padStart(2, "0")} left
            </span>
          ) : (
            <span>expiring, the release job runs every minute…</span>
          )}
        </>
      )}
    </p>
  );
}
