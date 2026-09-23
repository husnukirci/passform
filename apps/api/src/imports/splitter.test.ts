import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chunkPath, splitFile } from "./splitter.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "passform-split-"));
  process.env.DATA_DIR = dir;
});

afterAll(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function lineCount(path: string): Promise<number> {
  return (await readFile(path, "utf8")).split("\n").filter((line) => line !== "").length;
}

describe("splitFile", () => {
  it("writes 2,500 lines as three chunk files of 1000, 1000 and 500 rows", async () => {
    const source = join(dir, "source.jsonl");
    const lines = Array.from({ length: 2500 }, (_, i) => JSON.stringify({ sku: `SKU-${i}` }));
    // A blank line in the middle is skipped, not counted and not copied.
    await writeFile(
      source,
      `${lines.slice(0, 1200).join("\n")}\n\n${lines.slice(1200).join("\n")}\n`,
    );

    const result = await splitFile("imp_test", source);

    expect(result.totalRows).toBe(2500);
    expect(result.chunks).toEqual([
      { seq: 0, rowFrom: 0, rowTo: 1000 },
      { seq: 1, rowFrom: 1000, rowTo: 2000 },
      { seq: 2, rowFrom: 2000, rowTo: 2500 },
    ]);
    expect(await lineCount(chunkPath("imp_test", 0))).toBe(1000);
    expect(await lineCount(chunkPath("imp_test", 1))).toBe(1000);
    expect(await lineCount(chunkPath("imp_test", 2))).toBe(500);
    // Rows are copied verbatim, in order: the 1001st line of the file opens chunk 1.
    expect((await readFile(chunkPath("imp_test", 1), "utf8")).split("\n")[0]).toBe(lines[1000]);
  });

  it("splits an empty file into no chunks", async () => {
    const source = join(dir, "empty.jsonl");
    await writeFile(source, "");

    expect(await splitFile("imp_empty", source)).toEqual({ totalRows: 0, chunks: [] });
  });

  it("rejects a file that does not exist", async () => {
    await expect(splitFile("imp_missing", join(dir, "nope.jsonl"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
