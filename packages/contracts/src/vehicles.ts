import { z } from "zod";

import { Fuel, YearMonth } from "./common.ts";

/** Raw as typed; the domain trims, uppercases and validates. */
export const ResolveVehicleQuery = z.object({ manufacturer: z.string(), type: z.string() });
export type ResolveVehicleQuery = z.infer<typeof ResolveVehicleQuery>;

export const VehicleVariantDto = z.object({
  id: z.string(),
  make: z.string(),
  model: z.string(),
  engineCode: z.string(),
  kw: z.number().int(),
  fuel: Fuel,
  buildFrom: YearMonth,
  buildTo: YearMonth.nullable(),
  /** Empty means the record does not say; fit evaluation then answers `ask`. */
  equipment: z.array(z.string()),
  key: z.object({ manufacturer: z.string(), type: z.string() }),
  /** The line a customer picks from when a key needs disambiguation. */
  label: z.string(),
});
export type VehicleVariantDto = z.infer<typeof VehicleVariantDto>;

export const ResolveVehicleResponse = z.object({
  variants: z.array(VehicleVariantDto),
  needsDisambiguation: z.boolean(),
});
export type ResolveVehicleResponse = z.infer<typeof ResolveVehicleResponse>;

export const MakesResponse = z.object({ makes: z.array(z.string()) });
export type MakesResponse = z.infer<typeof MakesResponse>;

export const ModelsQuery = z.object({ make: z.string().min(1) });
export type ModelsQuery = z.infer<typeof ModelsQuery>;

export const ModelsResponse = z.object({ make: z.string(), models: z.array(z.string()) });
export type ModelsResponse = z.infer<typeof ModelsResponse>;

export const VariantsQuery = z.object({ make: z.string().min(1), model: z.string().min(1) });
export type VariantsQuery = z.infer<typeof VariantsQuery>;

export const VariantsResponse = z.object({ variants: z.array(VehicleVariantDto) });
export type VariantsResponse = z.infer<typeof VariantsResponse>;
