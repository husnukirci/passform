import { describe, expect, it } from "vitest";

import { assembleTree } from "./categories.repository.js";

describe("assembleTree", () => {
  it("nests children under parents and keeps sibling order", () => {
    const tree = assembleTree([
      { id: "brakes", name: "Brakes", parentId: null },
      { id: "brakes/discs", name: "Discs", parentId: "brakes" },
      { id: "brakes/pads", name: "Pads", parentId: "brakes" },
      { id: "care", name: "Care", parentId: null },
    ]);

    expect(tree).toEqual([
      {
        id: "brakes",
        name: "Brakes",
        children: [
          { id: "brakes/discs", name: "Discs", children: [] },
          { id: "brakes/pads", name: "Pads", children: [] },
        ],
      },
      { id: "care", name: "Care", children: [] },
    ]);
  });

  it("treats a child listed before its parent the same way", () => {
    const tree = assembleTree([
      { id: "brakes/pads", name: "Pads", parentId: "brakes" },
      { id: "brakes", name: "Brakes", parentId: null },
    ]);

    expect(tree).toEqual([
      {
        id: "brakes",
        name: "Brakes",
        children: [{ id: "brakes/pads", name: "Pads", children: [] }],
      },
    ]);
  });
});
