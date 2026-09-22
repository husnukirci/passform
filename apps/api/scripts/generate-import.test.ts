import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ImportRow, validateImportRow } from "@passform/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateDataset } from "./generate.js";
import { generateImportFile, type GenerateImportResult } from "./generate-import.js";
import { readJsonl } from "./jsonl.js";
import type { PartLine } from "./synth.js";

let dir: string;
let result: GenerateImportResult;
let rows: ImportRow[];
let existingSkus: Map<string, PartLine>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "passform-import-"));
  await generateDataset({ profile: "small", out: dir });
  result = await generateImportFile({
    rows: 300,
    supplier: "s_01",
    from: dir,
    out: join(dir, "imports", "a.jsonl"),
  });
  rows = [];
  for await (const row of readJsonl<ImportRow>(join(dir, "imports", "a.jsonl"))) rows.push(row);
  existingSkus = new Map();
  for await (const line of readJsonl<PartLine>(join(dir, "parts.jsonl"))) {
    existingSkus.set(line.sku, line);
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("generateImportFile", () => {
  it("writes the requested number of rows, 70% updates and 30% new", () => {
    expect(result).toEqual({ rows: 300, updates: 210, created: 90 });
    expect(rows).toHaveLength(300);
    const updates = rows.filter((row) => existingSkus.has(row.sku));
    expect(updates).toHaveLength(210);
  });

  it("emits rows that validate as import rows", () => {
    for (const row of rows) {
      expect(validateImportRow(row)).toEqual({ ok: true, row });
    }
  });

  it("changes price, stock and one fitment on an update", () => {
    const update = rows.find((row) => existingSkus.has(row.sku) && !row.universal);
    if (!update) throw new Error("no non-universal update in the sample");
    const before = existingSkus.get(update.sku);
    if (!before) throw new Error("unreachable: sku was looked up above");
    expect(update.priceCents).toBeGreaterThanOrEqual(Math.floor(before.priceCents * 0.9));
    expect(update.priceCents).toBeLessThanOrEqual(Math.ceil(before.priceCents * 1.1));
    expect(update.stockQty).not.toBe(before.stockQty);
    expect(update.fitments).not.toEqual(before.fitments);
    expect(Math.abs(update.fitments.length - before.fitments.length)).toBeLessThanOrEqual(1);
  });

  it("is deterministic for the same arguments", async () => {
    await generateImportFile({
      rows: 300,
      supplier: "s_01",
      from: dir,
      out: join(dir, "imports", "b.jsonl"),
    });
    const [a, b] = await Promise.all([
      readFile(join(dir, "imports", "a.jsonl")),
      readFile(join(dir, "imports", "b.jsonl")),
    ]);
    expect(a.equals(b)).toBe(true);
  });
});
