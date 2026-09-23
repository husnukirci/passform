import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { validateImportRow } from "@passform/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateDataset, type GenerateResult } from "./generate.js";
import { readJsonl } from "../src/infra/jsonl.js";
import type { PartLine } from "./synth.js";

// The small profile takes well under a second, so the tests generate it
// for real instead of stubbing anything.

let dirA: string;
let dirB: string;
let result: GenerateResult;

beforeAll(async () => {
  dirA = await mkdtemp(join(tmpdir(), "passform-gen-a-"));
  dirB = await mkdtemp(join(tmpdir(), "passform-gen-b-"));
  result = await generateDataset({ profile: "small", out: dirA });
  await generateDataset({ profile: "small", out: dirB });
});

afterAll(async () => {
  await rm(dirA, { recursive: true, force: true });
  await rm(dirB, { recursive: true, force: true });
});

describe("generateDataset small", () => {
  it("is byte-identical across runs", async () => {
    for (const file of ["variants.jsonl", "parts.jsonl", "categories.json", "suppliers.json"]) {
      const [a, b] = await Promise.all([readFile(join(dirA, file)), readFile(join(dirB, file))]);
      expect(a.equals(b), file).toBe(true);
    }
  });

  it("reports the profile's row counts", () => {
    expect(result).toMatchObject({ variants: 2000, parts: 5000, suppliers: 6 });
    expect(result.categories).toBeGreaterThan(60);
  });

  it("writes parts that validate as import rows, with 4–20 fitments unless universal", async () => {
    let universal = 0;
    let lines = 0;
    for await (const line of readJsonl<PartLine>(join(dirA, "parts.jsonl"))) {
      lines += 1;
      const { id: _id, supplierId: _supplierId, ...row } = line;
      const verdict = validateImportRow(row);
      expect(verdict.ok, `${line.sku}: ${JSON.stringify(verdict)}`).toBe(true);
      if (line.universal) {
        universal += 1;
        expect(line.fitments).toEqual([]);
      } else {
        expect(line.fitments.length).toBeGreaterThanOrEqual(4);
        expect(line.fitments.length).toBeLessThanOrEqual(20);
      }
    }
    expect(lines).toBe(5000);
    expect(universal / lines).toBeGreaterThan(0.03);
    expect(universal / lines).toBeLessThan(0.07);
  });
});
