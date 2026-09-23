import { describe, expect, it } from "vitest";

import { CategoriesResponse } from "./categories.ts";

describe("CategoriesResponse", () => {
  it("accepts nested nodes and rejects a node without children", () => {
    const tree = {
      categories: [
        {
          id: "brakes",
          name: "Brakes",
          children: [{ id: "brakes/pads", name: "Pads", children: [] }],
        },
      ],
    };

    expect(CategoriesResponse.parse(tree)).toEqual(tree);
    expect(
      CategoriesResponse.safeParse({ categories: [{ id: "brakes", name: "Brakes" }] }).success,
    ).toBe(false);
  });
});
