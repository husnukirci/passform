import type { OrderResponse } from "@passform/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { LAST_ORDER_KEY } from "@/lib/lastOrder";

import OrderPage from "./page";

vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({ push: vi.fn() }) }));

const placed: OrderResponse = {
  id: "ord_ce6b109911d8",
  status: "placed",
  totalCents: 16120,
  lines: [
    {
      partId: "p_0000001",
      sku: "LOR-0000001",
      name: "Lorrexa Bushings U696",
      qty: 2,
      unitCents: 7420,
    },
    {
      partId: "p_0000002",
      sku: "DUN-0000002",
      name: "Dunmoor Tail lamps F528",
      qty: 1,
      unitCents: 1280,
    },
  ],
  expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
  confirmedAt: null,
};

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch: vi.fn(async () => placed),
}));

describe("/orders/[id] page", () => {
  it("renders the placed order with its confirm and send-again controls", async () => {
    sessionStorage.setItem(
      LAST_ORDER_KEY,
      JSON.stringify({
        orderId: placed.id,
        key: "0b4f0e2a-6d3c-4f5e-9a1b-2c3d4e5f6a7b",
        body: { lines: placed.lines.map(({ partId, qty }) => ({ partId, qty })) },
        status: 201,
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        {await OrderPage({ params: Promise.resolve({ id: placed.id }) })}
      </QueryClientProvider>,
    );

    expect(screen.getByText("placed")).toBeInTheDocument();
    expect(screen.getByText("€161.20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm order" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send again" })).toBeEnabled();
    expect(screen.getByText("201 created")).toBeInTheDocument();
  });
});
