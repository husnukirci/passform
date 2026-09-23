// Line-oriented JSON helpers with backpressure, so a 2,000,000-part file
// streams to disk without buffering in memory. Shared by the generator, the
// seeder and the import splitter.

import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { once } from "node:events";
import { createInterface } from "node:readline";

export class JsonlWriter {
  private readonly stream: WriteStream;
  private lines = 0;

  constructor(path: string) {
    this.stream = createWriteStream(path);
  }

  async write(value: unknown): Promise<void> {
    this.lines += 1;
    if (!this.stream.write(`${JSON.stringify(value)}\n`)) {
      await once(this.stream, "drain");
    }
  }

  get count(): number {
    return this.lines;
  }

  async close(): Promise<void> {
    this.stream.end();
    await once(this.stream, "finish");
  }
}

/** Parses each non-empty line as JSON. The caller narrows the type. */
export async function* readJsonl<T>(path: string): AsyncGenerator<T> {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length > 0) yield JSON.parse(line) as T;
  }
}
