import { describe, expect, it } from "vitest";

import { DOMAIN_VERSION } from "./index.js";

describe("domain package", () => {
  it("exports a version placeholder", () => {
    expect(DOMAIN_VERSION).toBe("0.0.0");
  });
});
