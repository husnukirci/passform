import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateImportResponse, ImportStatusResponse } from "@passform/contracts";
import { CHUNK_SIZE } from "@passform/domain";
import type { Queue } from "bullmq";

import { dataDir } from "../infra/data-dir.js";
import { type ChunkJob, chunkJobId, IMPORT_CHUNK } from "../infra/queues.js";
import { ImportsRepository } from "./imports.repository.js";
import { splitFile } from "./splitter.js";

export interface CreateImportInput {
  supplierId: string;
  /** Absolute path of the `.jsonl` file to import. */
  filePath: string;
}

/**
 * A `path` from the request is relative to `DATA_DIR` and must stay inside
 * it; the file must exist before an import row is written for it.
 */
export async function resolveImportPath(path: string): Promise<string> {
  const root = dataDir();
  const filePath = resolve(root, path);
  if (!filePath.startsWith(`${root}${sep}`)) {
    throw new BadRequestException(`path must be inside DATA_DIR: ${path}`);
  }
  try {
    await access(filePath);
  } catch {
    throw new NotFoundException(`file ${path} not found under DATA_DIR`);
  }
  return filePath;
}

export function newImportId(): string {
  return `imp_${randomBytes(6).toString("hex")}`;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly imports: ImportsRepository,
    @InjectQueue(IMPORT_CHUNK) private readonly chunks: Queue<ChunkJob>,
  ) {}

  /**
   * Records the import, splits the file, records one pending chunk per range
   * and queues one job per chunk. The import is `running` before the first
   * job exists, because a job can finish before the next statement runs.
   */
  async create({ supplierId, filePath }: CreateImportInput): Promise<CreateImportResponse> {
    if (!(await this.imports.supplierExists(supplierId))) {
      throw new NotFoundException(`supplier ${supplierId} not found`);
    }
    const importId = newImportId();
    await this.imports.create({ id: importId, supplierId, filePath, chunkSize: CHUNK_SIZE });

    try {
      const { totalRows, chunks } = await splitFile(importId, filePath, CHUNK_SIZE);
      await this.imports.addChunks(importId, totalRows, chunks);
      if (chunks.length === 0) {
        // Nothing to process and nothing to rebuild for.
        await this.imports.finish(importId, "completed");
        return { importId };
      }
      await this.imports.start(importId);
      await this.chunks.addBulk(
        chunks.map(({ seq }) => ({
          name: "chunk",
          data: { importId, seq },
          opts: { jobId: chunkJobId({ importId, seq }) },
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.imports.finish(importId, "failed", { message });
      throw error;
    }
    return { importId };
  }

  async get(id: string): Promise<ImportStatusResponse> {
    const summary = await this.imports.summary(id);
    if (summary === null) throw new NotFoundException(`import ${id} not found`);
    const { supplierId: _supplierId, startedAt, finishedAt, ...rest } = summary;
    return {
      ...rest,
      startedAt: startedAt?.toISOString() ?? null,
      finishedAt: finishedAt?.toISOString() ?? null,
    };
  }
}
