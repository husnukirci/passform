import { describe, expect, it } from "vitest";

import { DomainError } from "./types.js";

describe("DomainError", () => {
  it("is an Error named DomainError that keeps its message", () => {
    const error = new DomainError("qty: must be at least 1");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DomainError");
    expect(error.message).toBe("qty: must be at least 1");
  });
});
