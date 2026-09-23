import { z } from "zod";

export const ImportStatus = z.enum(["queued", "running", "completed", "partial", "failed"]);
export type ImportStatus = z.infer<typeof ImportStatus>;

/**
 * `path` is a file under `DATA_DIR`, relative to it (a generated import
 * file). A multipart request carries the file itself and no `path`.
 */
export const CreateImportBody = z.object({
  supplierId: z.string().min(1),
  path: z.string().min(1).optional(),
});
export type CreateImportBody = z.infer<typeof CreateImportBody>;

export const CreateImportResponse = z.object({ importId: z.string() });
export type CreateImportResponse = z.infer<typeof CreateImportResponse>;

export const ImportStatusResponse = z.object({
  id: z.string(),
  status: ImportStatus,
  totalRows: z.number().int(),
  /** Rows upserted so far; `failedRows` counts rows rejected by validation. */
  processedRows: z.number().int(),
  failedRows: z.number().int(),
  chunks: z.object({
    pending: z.number().int(),
    done: z.number().int(),
    failed: z.number().int(),
  }),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  /** Set when the split or the index rebuild failed; chunk failures show in `chunks` instead. */
  error: z.object({ message: z.string() }).nullable(),
});
export type ImportStatusResponse = z.infer<typeof ImportStatusResponse>;
