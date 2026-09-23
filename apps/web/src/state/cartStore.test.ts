import { beforeEach, describe, expect, it } from "vitest";

import { type CartPart, useCartStore } from "./cartStore";

const pads: CartPart = { id: "p_1", sku: "REM-1", name: "Pads", priceCents: 1250, stockQty: 3 };
const discs: CartPart = { id: "p_2", sku: "TRE-2", name: "Discs", priceCents: 6530, stockQty: 10 };

describe("cartStore", () => {
  beforeEach(() => {
    useCartStore.getState().clear();
  });

  it("adds a part with qty 1 and increments on a second add", () => {
    const { add } = useCartStore.getState();
    add(pads);
    add(discs);
    add(pads);

    expect(useCartStore.getState().lines).toEqual({
      p_1: { partId: "p_1", sku: "REM-1", name: "Pads", unitCents: 1250, qty: 2, stockQty: 3 },
      p_2: { partId: "p_2", sku: "TRE-2", name: "Discs", unitCents: 6530, qty: 1, stockQty: 10 },
    });
  });

  it("clamps quantities to 1..stockQty", () => {
    const { add, setQty } = useCartStore.getState();
    add(pads);

    setQty("p_1", 99);
    expect(useCartStore.getState().lines.p_1?.qty).toBe(3);
    setQty("p_1", 0);
    expect(useCartStore.getState().lines.p_1?.qty).toBe(1);
    setQty("p_1", 2.7);
    expect(useCartStore.getState().lines.p_1?.qty).toBe(2);
  });

  it("does not add a part that is out of stock", () => {
    useCartStore.getState().add({ ...pads, stockQty: 0 });

    expect(useCartStore.getState().lines).toEqual({});
  });

  it("removes a line and clears the cart", () => {
    const { add, remove, clear, setVariant } = useCartStore.getState();
    setVariant("v_000001");
    add(pads);
    add(discs);

    remove("p_1");
    expect(Object.keys(useCartStore.getState().lines)).toEqual(["p_2"]);

    clear();
    expect(useCartStore.getState().lines).toEqual({});
    expect(useCartStore.getState().variantId).toBe("v_000001");
  });

  it("generates the idempotency key once per cart and reuses it until the cart is cleared", () => {
    const store = useCartStore.getState();
    store.add(pads);

    const key = store.ensurePendingKey();
    store.add(discs);
    store.setQty("p_1", 2);

    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(useCartStore.getState().ensurePendingKey()).toBe(key);
    expect(useCartStore.getState().pendingKey).toBe(key);

    store.clear();
    expect(useCartStore.getState().pendingKey).toBeNull();
    expect(useCartStore.getState().ensurePendingKey()).not.toBe(key);
  });

  it("persists under pf_cart in localStorage", () => {
    useCartStore.getState().add(pads);

    const raw = localStorage.getItem("pf_cart");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}").state.lines.p_1.sku).toBe("REM-1");
  });
});
