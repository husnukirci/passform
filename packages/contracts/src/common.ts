// Primitives shared by several resources. They mirror the domain's value
// types field for field; the domain stays zod-free, so the mirror lives here.

import { z } from "zod";

export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");
export type YearMonth = z.infer<typeof YearMonth>;

export const Fuel = z.enum(["petrol", "diesel", "hybrid", "electric"]);
export type Fuel = z.infer<typeof Fuel>;

export const Axle = z.enum(["front", "rear"]);
export type Axle = z.infer<typeof Axle>;

export const BrandTier = z.enum(["oe", "premium", "standard"]);
export type BrandTier = z.infer<typeof BrandTier>;

/** The domain's `FitResult`, one branch per outcome. */
export const FitDto = z.discriminatedUnion("result", [
  z.object({ result: z.literal("fits"), reason: z.string() }),
  z.object({ result: z.literal("no"), reason: z.string() }),
  z.object({ result: z.literal("ask"), reason: z.string(), equipmentCode: z.string() }),
]);
export type FitDto = z.infer<typeof FitDto>;
