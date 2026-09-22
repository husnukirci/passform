import { describe, expect, it } from "vitest";

import { DomainError } from "./types.ts";
import { compareYearMonth, isYearMonth, withinWindow } from "./yearMonth.ts";

describe("isYearMonth", () => {
  it.each(["2012-08", "1999-01", "2030-12"])("accepts %s", (value) => {
    expect(isYearMonth(value)).toBe(true);
  });

  it.each([
    ["2012-13", "month above 12"],
    ["2012-00", "month zero"],
    ["2012-8", "month not zero-padded"],
    ["12-08", "two-digit year"],
    ["2012/08", "wrong separator"],
    ["2012-08-01", "full date"],
    ["", "empty"],
    [" 2012-08", "leading whitespace"],
  ])("rejects %s (%s)", (value) => {
    expect(isYearMonth(value)).toBe(false);
  });
});

describe("compareYearMonth", () => {
  it("orders months within a year", () => {
    expect(compareYearMonth("2012-08", "2012-12")).toBe(-1);
  });

  it("orders across a year boundary", () => {
    expect(compareYearMonth("2012-12", "2013-01")).toBe(-1);
    expect(compareYearMonth("2013-01", "2012-08")).toBe(1);
  });

  it("returns 0 for equal values", () => {
    expect(compareYearMonth("2012-08", "2012-08")).toBe(0);
  });
});

describe("withinWindow", () => {
  it("is inclusive at the lower bound", () => {
    expect(withinWindow("2012-08", "2012-08", "2015-01")).toBe(true);
  });

  it("is inclusive at the upper bound", () => {
    expect(withinWindow("2015-01", "2012-08", "2015-01")).toBe(true);
  });

  it("rejects a date just before the window", () => {
    expect(withinWindow("2012-07", "2012-08", "2015-01")).toBe(false);
  });

  it("rejects a date just after the window", () => {
    expect(withinWindow("2015-02", "2012-08", "2015-01")).toBe(false);
  });

  it("treats a null lower bound as open", () => {
    expect(withinWindow("1990-01", null, "2015-01")).toBe(true);
  });

  it("treats a null upper bound as open", () => {
    expect(withinWindow("2099-12", "2012-08", null)).toBe(true);
  });

  it("accepts every date when both bounds are null", () => {
    expect(withinWindow("2012-08", null, null)).toBe(true);
  });

  it("throws DomainError for an invalid date", () => {
    expect(() => withinWindow("2012-13", null, null)).toThrow(DomainError);
  });

  it("throws DomainError for an invalid bound", () => {
    expect(() => withinWindow("2012-08", "2012", null)).toThrow(DomainError);
    expect(() => withinWindow("2012-08", null, "next year")).toThrow(DomainError);
  });
});
