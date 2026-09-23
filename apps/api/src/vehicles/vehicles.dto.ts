// Query DTO classes for the validation pipe (it keys on the class), and
// the one domain -> contract mapping for a variant.

import {
  ModelsQuery,
  ResolveVehicleQuery,
  VariantsQuery,
  type VehicleVariantDto,
} from "@passform/contracts";
import { type VehicleVariant, variantLabel } from "@passform/domain";
import { createZodDto } from "nestjs-zod";

export class ResolveVehicleQueryDto extends createZodDto(ResolveVehicleQuery) {}
export class ModelsQueryDto extends createZodDto(ModelsQuery) {}
export class VariantsQueryDto extends createZodDto(VariantsQuery) {}

export function toVariantDto(variant: VehicleVariant): VehicleVariantDto {
  return { ...variant, label: variantLabel(variant) };
}
