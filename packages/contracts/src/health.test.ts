import { describe, expect, it } from "vitest";

import { HealthResponse } from "./health.ts";

describe("HealthResponse", () => {
  it("accepts { ok: true }", () => {
    expect(HealthResponse.parse({ ok: true })).toEqual({ ok: true });
  });

  it("rejects { ok: false }", () => {
    expect(HealthResponse.safeParse({ ok: false }).success).toBe(false);
  });
});
