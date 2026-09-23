import { z } from "zod";

/** Every non-2xx body. `issues` is present only for validation failures. */
export const ErrorResponse = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
