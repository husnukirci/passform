import { describe, expect, it } from "vitest";

import { chunked, csvLine, pgTextArray } from "./csv.js";

describe("csvLine", () => {
  it("quotes strings, leaves numbers and booleans bare, and writes null as an empty field", () => {
    expect(csvLine(["p_1", 4990, true, null, ""])).toBe('"p_1",4990,true,,""\n');
  });

  it("doubles embedded quotes", () => {
    expect(csvLine(['say "hi"'])).toBe('"say ""hi"""\n');
  });
});

describe("pgTextArray", () => {
  it("renders the postgres literal with each item quoted", () => {
    expect(pgTextArray(["BRK-L", "AC"])).toBe('{"BRK-L","AC"}');
    expect(pgTextArray([])).toBe("{}");
  });

  it("escapes quotes and backslashes inside items", () => {
    expect(pgTextArray(['a"b', "c\\d"])).toBe('{"a\\"b","c\\\\d"}');
  });
});

describe("chunked", () => {
  it("joins lines up to the byte budget and flushes the remainder", async () => {
    async function* lines(): AsyncGenerator<string> {
      yield "aa\n";
      yield "bb\n";
      yield "cc\n";
    }
    const chunks = [];
    for await (const chunk of chunked(lines(), 5)) chunks.push(chunk);
    expect(chunks).toEqual(["aa\nbb\n", "cc\n"]);
  });
});
