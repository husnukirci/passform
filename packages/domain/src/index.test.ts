import { describe, expect, it } from "vitest";

import * as domain from "./index.js";

describe("domain package public surface", () => {
  it("exports every rule module's functions and constants", () => {
    expect(Object.keys(domain).sort()).toEqual([
      "BOOSTS",
      "CHUNK_SIZE",
      "DomainError",
      "PAGE_SIZE",
      "RESERVATION_TTL_MINUTES",
      "buildSearchQuery",
      "canonicalJson",
      "chunkRanges",
      "compareYearMonth",
      "evaluateFit",
      "isIdempotencyKey",
      "isYearMonth",
      "lineTotalCents",
      "orderTotalCents",
      "parseRegistrationKey",
      "reservationExpiresAt",
      "resolveVariants",
      "validateImportRow",
      "variantLabel",
      "withinWindow",
    ]);
  });
});
