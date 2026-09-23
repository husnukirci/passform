import { z } from "zod";

export const SupplierDto = z.object({ id: z.string(), name: z.string() });
export type SupplierDto = z.infer<typeof SupplierDto>;

/** The suppliers an import can be filed under; the imports page offers them as a list. */
export const SuppliersResponse = z.object({ suppliers: z.array(SupplierDto) });
export type SuppliersResponse = z.infer<typeof SuppliersResponse>;
