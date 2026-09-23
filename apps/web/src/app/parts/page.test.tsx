import type { SearchHitDto } from "@passform/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import PartsPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("@/lib/vehicle.server", () => ({ cookieVariantId: async () => null }));

const hit = (overrides: Partial<SearchHitDto>): SearchHitDto => ({
  id: "p_0000001",
  sku: "REM-0000001",
  brand: "Rembrix",
  brandTier: "standard",
  categorySlug: "brakes/pads",
  name: "Rembrix Pads A100",
  oeRef: "VAR-1",
  attributes: {},
  priceCents: 1250,
  universal: false,
  inStock: true,
  fit: { result: "fits", reason: "Fits Varenta Ivane P30-66 (2011-08 → 2016-02)" },
  ...overrides,
});

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith("/categories")) {
      return { categories: [{ id: "brakes", name: "Brakes", children: [] }] };
    }
    if (path.startsWith("/search")) {
      return {
        hits: [
          hit({}),
          hit({
            id: "p_0000002",
            sku: "TRE-0000002",
            name: "Tremosk Sensor B200",
            inStock: false,
            fit: {
              result: "ask",
              reason: "Fits if the vehicle has equipment AC; confirm before ordering",
              equipmentCode: "AC",
            },
          }),
        ],
        stages: { fitted: 2, shown: 2 },
        page: 1,
        pageSize: 24,
      };
    }
    throw new Error(`unexpected path ${path}`);
  }),
}));

describe("/parts page", () => {
  it("renders the stage strip and one badge per hit, each with its word and reason", async () => {
    render(await PartsPage({ searchParams: Promise.resolve({ variant: "v_000001" }) }));

    expect(
      screen.getByText("2 fit your vehicle → 2 shown, in stock first, then price"),
    ).toBeInTheDocument();

    expect(screen.getByText("fits")).toBeInTheDocument();
    expect(screen.getByText("Fits Varenta Ivane P30-66 (2011-08 → 2016-02)")).toBeInTheDocument();
    expect(screen.getByText("ask · needs AC")).toBeInTheDocument();
    expect(
      screen.getByText("Fits if the vehicle has equipment AC; confirm before ordering"),
    ).toBeInTheDocument();

    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });
});
