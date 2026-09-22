// Shared value types for the domain core. Plain data only: every rule in
// this package takes and returns these shapes, nothing framework-specific.

export type Fuel = "petrol" | "diesel" | "hybrid" | "electric";
export type Axle = "front" | "rear";
export type BrandTier = "oe" | "premium" | "standard";

/** "YYYY-MM", validated by yearMonth.ts. */
export type YearMonth = string;

export interface RegistrationKey {
  /** Exactly 4 digits. */
  manufacturer: string;
  /** Exactly 3 characters [A-Z0-9], uppercased. */
  type: string;
}

export interface VehicleVariant {
  id: string;
  make: string;
  model: string;
  engineCode: string;
  kw: number;
  fuel: Fuel;
  buildFrom: YearMonth;
  buildTo: YearMonth | null;
  /** Equipment codes the variant record carries; empty means unknown. */
  equipment: string[];
  key: RegistrationKey;
}

export interface Fitment {
  variantId: string;
  buildFrom: YearMonth | null;
  buildTo: YearMonth | null;
  axle: Axle | null;
  equipmentCode: string | null;
}

export interface Part {
  id: string;
  sku: string;
  brand: string;
  brandTier: BrandTier;
  categorySlug: string;
  name: string;
  oeRef: string;
  attributes: Record<string, string | number>;
  priceCents: number;
  stockQty: number;
  supplierId: string;
  /** Fits every vehicle; carries no fitment rows. */
  universal: boolean;
}

export type FitResult =
  | { result: "fits"; reason: string }
  | { result: "no"; reason: string }
  | { result: "ask"; reason: string; equipmentCode: string };

export interface OrderLineInput {
  partId: string;
  /** Positive integer. */
  qty: number;
  unitCents: number;
}

/** Thrown when input violates a domain rule. The message names the field. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
