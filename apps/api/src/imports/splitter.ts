// Splits a supplier `.jsonl` file into chunk files under
// `$DATA_DIR/imports/<importId>/`, one per domain `ChunkRange`, so a chunk
// job needs only its `(importId, seq)` to find its rows. Lines are copied
// verbatim: nothing is parsed here, so a malformed line is the processor's
// row error rather than a failed split.

import { createReadStream } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { type ChunkRange, CHUNK_SIZE, chunkRanges } from "@passform/domain";

import { dataDir } from "../infra/data-dir.js";
import { JsonlWriter } from "../infra/jsonl.js";

export interface SplitResult {
  totalRows: number;
  chunks: ChunkRange[];
}

export function importDir(importId: string): string {
  return join(dataDir(), "imports", importId);
}

export function chunkPath(importId: string, seq: number): string {
  return join(importDir(importId), `chunk-${seq}.jsonl`);
}

export async function splitFile(
  importId: string,
  filePath: string,
  chunkSize: number = CHUNK_SIZE,
): Promise<SplitResult> {
  // A missing file fails here with a plain ENOENT instead of inside the stream.
  await access(filePath);
  await mkdir(importDir(importId), { recursive: true });

  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let totalRows = 0;
  let writer: JsonlWriter | undefined;
  for await (const line of lines) {
    if (line.length === 0) continue;
    if (totalRows % chunkSize === 0) {
      await writer?.close();
      writer = new JsonlWriter(chunkPath(importId, totalRows / chunkSize));
    }
    // `writer` is assigned on the first row of every chunk, just above.
    await writer?.writeLine(line);
    totalRows += 1;
  }
  await writer?.close();

  return { totalRows, chunks: chunkRanges(totalRows, chunkSize) };
}
