// Row <-> domain mappers. The only place column names and domain field
// names meet: repositories and seeding go through these, the domain never
// sees a row.

import type { Fitment, Part, VehicleVariant } from "@passform/domain";

import { type fitments, type parts, type vehicleVariants } from "./schema.js";

export type VariantRow = typeof vehicleVariants.$inferSelect;
export type VariantInsert = typeof vehicleVariants.$inferInsert;
export type PartRow = typeof parts.$inferSelect;
export type PartInsert = typeof parts.$inferInsert;
export type FitmentRow = typeof fitments.$inferSelect;
export type FitmentInsert = typeof fitments.$inferInsert;

export function rowToVariant(row: VariantRow): VehicleVariant {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    engineCode: row.engineCode,
    kw: row.kw,
    fuel: row.fuel,
    buildFrom: row.buildFrom,
    buildTo: row.buildTo,
    equipment: [...row.equipment],
    key: { manufacturer: row.keyManufacturer, type: row.keyType },
  };
}

export function variantToRow(variant: VehicleVariant): VariantInsert {
  return {
    id: variant.id,
    make: variant.make,
    model: variant.model,
    engineCode: variant.engineCode,
    kw: variant.kw,
    fuel: variant.fuel,
    buildFrom: variant.buildFrom,
    buildTo: variant.buildTo,
    equipment: [...variant.equipment],
    keyManufacturer: variant.key.manufacturer,
    keyType: variant.key.type,
  };
}

export function rowToPart(row: PartRow): Part {
  return {
    id: row.id,
    sku: row.sku,
    brand: row.brand,
    brandTier: row.brandTier,
    categorySlug: row.categoryId,
    name: row.name,
    oeRef: row.oeRef,
    attributes: { ...row.attributes },
    priceCents: row.priceCents,
    stockQty: row.stockQty,
    supplierId: row.supplierId,
    universal: row.universal,
  };
}

export function partToRow(part: Part): PartInsert {
  return {
    id: part.id,
    sku: part.sku,
    brand: part.brand,
    brandTier: part.brandTier,
    categoryId: part.categorySlug,
    name: part.name,
    oeRef: part.oeRef,
    attributes: { ...part.attributes },
    priceCents: part.priceCents,
    stockQty: part.stockQty,
    supplierId: part.supplierId,
    universal: part.universal,
  };
}

/** A fitment row belongs to a part; the domain shape carries only the variant and restrictions. */
export function rowToFitment(row: FitmentRow): Fitment {
  return {
    variantId: row.variantId,
    buildFrom: row.buildFrom,
    buildTo: row.buildTo,
    axle: row.axle,
    equipmentCode: row.equipmentCode,
  };
}

export function fitmentToRow(partId: string, fitment: Fitment): FitmentInsert {
  return {
    partId,
    variantId: fitment.variantId,
    buildFrom: fitment.buildFrom,
    buildTo: fitment.buildTo,
    axle: fitment.axle,
    equipmentCode: fitment.equipmentCode,
  };
}
