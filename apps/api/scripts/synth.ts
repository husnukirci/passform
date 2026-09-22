// Synthesis rules for the deterministic dataset: given an Rng, produce
// variants and parts that satisfy the Phase 2 distribution targets. Pure
// and synchronous, so the output is a function of the seed alone.

import type {
  Axle,
  BrandTier,
  Fitment,
  Fuel,
  ImportRow,
  VehicleVariant,
  YearMonth,
} from "@passform/domain";

import {
  type Category,
  groupOf,
  isAxleCategory,
  LEAF_CATEGORIES,
  UNIVERSAL_LEAVES,
} from "./categories.js";
import { BRANDS, EQUIPMENT_CODES, MAKES, SUPPLIERS } from "./names.js";
import type { Rng } from "./prng.js";

export type ProfileName = "small" | "large";

export interface Profile {
  variants: number;
  parts: number;
}

export const PROFILES: Record<ProfileName, Profile> = {
  small: { variants: 2_000, parts: 5_000 },
  large: { variants: 50_000, parts: 2_000_000 },
};

export function isProfileName(value: string): value is ProfileName {
  return value === "small" || value === "large";
}

/** One line of parts.jsonl: an ImportRow plus the identities seeding needs. */
export interface PartLine extends ImportRow {
  id: string;
  supplierId: string;
}

export function variantId(n: number): string {
  return `v_${String(n).padStart(6, "0")}`;
}

export function partId(n: number): string {
  return `p_${String(n).padStart(7, "0")}`;
}

// --- months -----------------------------------------------------------------

const MIN_BUILD_YEAR = 2004;
const MAX_BUILD_YEAR = 2023;
const LAST_MONTH = monthIndex("2025-12");
/** Open-ended windows are treated as ten years long when placing a fitment window. */
const OPEN_WINDOW_MONTHS = 120;

export function monthIndex(ym: YearMonth): number {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return year * 12 + (month - 1);
}

export function yearMonthAt(index: number): YearMonth {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

// --- variants ---------------------------------------------------------------

interface EngineFamily {
  fuel: Fuel;
  weight: number;
  /** First engine-code letter. */
  letter: string;
  /** Displacement in decilitres, or battery kWh for electric. */
  sizes: readonly number[];
  kws: readonly number[];
}

const ENGINE_FAMILIES: readonly EngineFamily[] = [
  {
    fuel: "petrol",
    weight: 45,
    letter: "P",
    sizes: [10, 12, 14, 16, 18, 20, 25, 30],
    kws: [55, 66, 74, 85, 96, 110, 132, 150, 180, 210],
  },
  {
    fuel: "diesel",
    weight: 35,
    letter: "D",
    sizes: [15, 16, 19, 20, 22, 25, 30],
    kws: [55, 66, 77, 88, 100, 110, 130, 140, 170],
  },
  {
    fuel: "hybrid",
    weight: 12,
    letter: "H",
    sizes: [14, 16, 18, 20, 25],
    kws: [90, 105, 120, 135, 160, 190],
  },
  {
    fuel: "electric",
    weight: 8,
    letter: "E",
    sizes: [40, 52, 58, 64, 77, 82, 95],
    kws: [100, 110, 150, 170, 200, 240, 300],
  },
];

const SHARED_KEY_RATE = 0.2;
const UNKNOWN_EQUIPMENT_RATE = 0.3;
const HAS_BUILD_TO_RATE = 0.7;

/** Splits `total` into `parts` near-equal counts; the remainder goes to the first ones. */
export function split(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

function manufacturerKey(makeIndex: number): string {
  return String((1103 + makeIndex * 617) % 10000).padStart(4, "0");
}

function typeKey(counter: number): string {
  return counter.toString(36).toUpperCase().padStart(3, "0");
}

/**
 * Yields `total` variants in id order, make by make and model by model.
 * Within a model every (engineCode, kw, fuel, buildFrom) tuple is distinct,
 * 20% of registration keys are shared by 2–3 variants, and 30% of variants
 * carry no equipment.
 */
export function* synthVariants(rng: Rng, total: number): Generator<VehicleVariant> {
  let next = 1;
  const perMake = split(total, MAKES.length);

  for (const [makeIndex, make] of MAKES.entries()) {
    const manufacturer = manufacturerKey(makeIndex);
    let typeCounter = 0;
    const perModel = split(perMake[makeIndex] ?? 0, make.models.length);

    for (const [modelIndex, model] of make.models.entries()) {
      const seen = new Set<string>();
      let groupLeft = 0;
      let type = "";

      for (let i = 0; i < (perModel[modelIndex] ?? 0); i += 1) {
        if (groupLeft === 0) {
          groupLeft = rng.chance(SHARED_KEY_RATE) ? rng.int(2, 3) : 1;
          typeCounter += 1;
          type = typeKey(typeCounter);
        }
        groupLeft -= 1;

        const engine = synthEngine(rng, seen);
        const buildFromIndex = monthIndex(engine.buildFrom);
        const buildTo = rng.chance(HAS_BUILD_TO_RATE)
          ? yearMonthAt(Math.min(buildFromIndex + rng.int(30, 110), LAST_MONTH))
          : null;

        yield {
          id: variantId(next),
          make: make.name,
          model,
          engineCode: engine.code,
          kw: engine.kw,
          fuel: engine.fuel,
          buildFrom: engine.buildFrom,
          buildTo,
          equipment: synthEquipment(rng),
          key: { manufacturer, type },
        };
        next += 1;
      }
    }
  }
}

interface Engine {
  code: string;
  kw: number;
  fuel: Fuel;
  buildFrom: YearMonth;
}

function synthEngine(rng: Rng, seen: Set<string>): Engine {
  const family = rng.weighted(ENGINE_FAMILIES.map((f) => [f, f.weight] as const));
  const size = rng.pick(family.sizes);
  const kw = rng.pick(family.kws);
  const code = `${family.letter}${String(size).padStart(2, "0")}-${kw}`;
  let buildFromIndex = monthIndex(
    `${rng.int(MIN_BUILD_YEAR, MAX_BUILD_YEAR)}-${String(rng.int(1, 12)).padStart(2, "0")}`,
  );
  // Same engine twice in one model is normal (a facelift); the build date
  // is what keeps the tuple distinct, so walk forward until it is.
  while (seen.has(`${code}|${buildFromIndex}`)) buildFromIndex += 1;
  seen.add(`${code}|${buildFromIndex}`);
  return { code, kw, fuel: family.fuel, buildFrom: yearMonthAt(buildFromIndex) };
}

function synthEquipment(rng: Rng): string[] {
  if (rng.chance(UNKNOWN_EQUIPMENT_RATE)) return [];
  const codes = EQUIPMENT_CODES.filter(() => rng.chance(0.4));
  return codes.length > 0 ? codes : [rng.pick(EQUIPMENT_CODES)];
}

// --- parts ------------------------------------------------------------------

/** What the part synthesiser needs to know about the variants already generated. */
export interface VariantIndex {
  /** Build window per variant, by 0-based position (id `v_000001` is position 0). */
  windows: { from: number; to: number | null }[];
  /** [start, end) positions per make, in MAKES order. */
  makeRanges: [number, number][];
}

export function indexVariants(variants: Iterable<VehicleVariant>): VariantIndex {
  const windows: VariantIndex["windows"] = [];
  const makeRanges: VariantIndex["makeRanges"] = [];
  let currentMake = "";
  for (const v of variants) {
    if (v.make !== currentMake) {
      currentMake = v.make;
      makeRanges.push([windows.length, windows.length]);
    }
    const range = makeRanges[makeRanges.length - 1];
    if (range) range[1] = windows.length + 1;
    windows.push({
      from: monthIndex(v.buildFrom),
      to: v.buildTo === null ? null : monthIndex(v.buildTo),
    });
  }
  return { windows, makeRanges };
}

const UNIVERSAL_RATE = 0.05;
const OUT_OF_STOCK_RATE = 0.08;
const HOME_MAKE_RATE = 0.8;
const FITMENT_WINDOW_RATE = 0.2;
const FITMENT_AXLE_RATE = 0.3;
const FITMENT_EQUIPMENT_RATE = 0.1;
const MIN_FITMENTS = 4;
const MAX_FITMENTS = 20;

const PRICE_BASE_CENTS: Record<string, number> = {
  brakes: 4500,
  filters: 1500,
  lighting: 900,
  wipers: 1800,
  fluids: 2200,
  suspension: 7800,
  steering: 5200,
  engine: 3900,
  exhaust: 9800,
  electrical: 8800,
  cooling: 6500,
  clutch: 15900,
  body: 3200,
};

const TIER_MULTIPLIER: Record<BrandTier, number> = { oe: 1.6, premium: 1.25, standard: 1 };

/** Deterministic per-leaf spread so sibling leaves do not share one price point. */
function leafFactor(category: Category): number {
  let hash = 0;
  for (const ch of category.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.6 + (hash % 121) / 100; // 0.6 … 1.8
}

function priceCents(rng: Rng, category: Category, tier: BrandTier): number {
  const base = PRICE_BASE_CENTS[groupOf(category.id)] ?? 3000;
  const jitter = 0.85 + rng.float() * 0.3;
  const cents = base * leafFactor(category) * TIER_MULTIPLIER[tier] * jitter;
  return Math.max(10, Math.round(cents / 10) * 10);
}

function code3(name: string): string {
  return name
    .replace(/[^a-z]/gi, "")
    .slice(0, 3)
    .toUpperCase();
}

function attributesFor(rng: Rng, category: Category, axle: Axle | null): ImportRow["attributes"] {
  const attributes: ImportRow["attributes"] = { weightG: rng.int(40, 12000) };
  if (axle) attributes.axle = axle;
  switch (category.id) {
    case "brakes/discs":
      attributes.diameterMm = rng.int(240, 380);
      attributes.thicknessMm = rng.int(10, 34);
      break;
    case "brakes/pads":
      attributes.widthMm = rng.int(90, 190);
      attributes.heightMm = rng.int(40, 90);
      break;
    default:
      if (groupOf(category.id) === "filters") {
        attributes.heightMm = rng.int(50, 300);
        attributes.outerDiameterMm = rng.int(60, 160);
      } else {
        attributes.lengthMm = rng.int(20, 900);
      }
  }
  return attributes;
}

/** Synthesises part number `n` (1-based). Fitments reference variants in `index`. */
export function synthPart(rng: Rng, n: number, index: VariantIndex): PartLine {
  const universal = rng.chance(UNIVERSAL_RATE);
  const category = rng.pick(universal ? UNIVERSAL_LEAVES : LEAF_CATEGORIES);
  const brand = rng.pick(BRANDS);
  const supplier = rng.pick(SUPPLIERS);
  const homeMake = rng.int(0, MAKES.length - 1);
  const partAxle: Axle | null = isAxleCategory(category.id) ? rng.pick(["front", "rear"]) : null;
  const series = `${String.fromCharCode(65 + rng.int(0, 25))}${rng.int(100, 999)}`;

  return {
    id: partId(n),
    supplierId: supplier.id,
    sku: `${code3(brand.name)}-${String(n).padStart(7, "0")}`,
    brand: brand.name,
    brandTier: brand.tier,
    categorySlug: category.id,
    name: `${brand.name} ${category.name} ${series}`,
    oeRef: `${code3(MAKES[homeMake]?.name ?? "")}-${rng.int(10000, 99999)}`,
    attributes: attributesFor(rng, category, partAxle),
    priceCents: priceCents(rng, category, brand.tier),
    stockQty: rng.chance(OUT_OF_STOCK_RATE) ? 0 : rng.int(1, 80),
    universal,
    fitments: universal ? [] : synthFitments(rng, index, homeMake, partAxle),
  };
}

export function synthFitments(
  rng: Rng,
  index: VariantIndex,
  homeMake: number,
  partAxle: Axle | null,
): Fitment[] {
  const total = index.windows.length;
  const [homeStart, homeEnd] = index.makeRanges[homeMake] ?? [0, total];
  const count = rng.int(MIN_FITMENTS, MAX_FITMENTS);
  const used = new Set<number>();
  const fitments: Fitment[] = [];

  // A repeated variant is redrawn; the attempt cap only matters when a
  // profile has fewer variants than fitments to place.
  for (let attempt = 0; fitments.length < count && attempt < count * 4; attempt += 1) {
    const pos =
      rng.chance(HOME_MAKE_RATE) && homeEnd > homeStart
        ? rng.int(homeStart, homeEnd - 1)
        : rng.int(0, total - 1);
    if (used.has(pos)) continue;
    used.add(pos);
    fitments.push(synthFitment(rng, pos, index, partAxle));
  }
  return fitments;
}

function synthFitment(rng: Rng, pos: number, index: VariantIndex, partAxle: Axle | null): Fitment {
  const window = index.windows[pos];
  if (!window) throw new Error(`no variant at position ${pos}`);

  let buildFrom: YearMonth | null = null;
  let buildTo: YearMonth | null = null;
  if (rng.chance(FITMENT_WINDOW_RATE)) {
    const span = (window.to ?? window.from + OPEN_WINDOW_MONTHS) - window.from;
    const fromOffset = rng.int(0, span);
    const toOffset = rng.int(fromOffset, span);
    buildFrom = yearMonthAt(window.from + fromOffset);
    buildTo = yearMonthAt(window.from + toOffset);
  }

  return {
    variantId: variantId(pos + 1),
    buildFrom,
    buildTo,
    axle: partAxle !== null && rng.chance(FITMENT_AXLE_RATE) ? partAxle : null,
    equipmentCode: rng.chance(FITMENT_EQUIPMENT_RATE) ? rng.pick(EQUIPMENT_CODES) : null,
  };
}
