// Every make, model, brand and supplier in the synthetic dataset. All are
// invented compounds, each checked by web search against real vehicle
// makers, parts brands and companies before being added; any resemblance
// is coincidental. This is the only file the name scrub has to read.

import type { BrandTier } from "@passform/domain";

export interface Make {
  name: string;
  models: readonly string[];
}

export const MAKES: readonly Make[] = [
  { name: "Varenta", models: ["Ivane", "Kestra", "Lumvaren", "Pavane", "Rilla", "Sarto"] },
  { name: "Kolmberg", models: ["Ardvek", "Belvano", "Corda", "Dovan", "Ilvo", "Mirek"] },
  {
    name: "Tessaro",
    models: ["Anvolo", "Brivo", "Celvia", "Duomo", "Fervola", "Girasol", "Lanta"],
  },
  { name: "Brindmark", models: ["Ashmere", "Corran", "Eldram", "Fenwick", "Marlow"] },
  { name: "Halvora", models: ["Astrid", "Brinna", "Solva", "Tindra", "Ulla", "Viken"] },
  { name: "Quennard", models: ["Amiel", "Beaune", "Calvenne", "Dorine", "Esmarel", "Lisle"] },
  { name: "Sorvique", models: ["Arcto", "Borresk", "Cirvo", "Nimbo", "Stralvo", "Zevrilla"] },
  {
    name: "Ludmeyer",
    models: ["Adrach", "Brechtal", "Falvorn", "Halbrecht", "Kranich", "Milvorne"],
  },
  { name: "Wexmoor", models: ["Bexley", "Cotter", "Dunley", "Hartell", "Pemberly", "Thorne"] },
  { name: "Caldrith", models: ["Embrith", "Flinrock", "Kiln", "Onvaro", "Sladrith", "Tallow"] },
  { name: "Norvane", models: ["Fjell", "Havnorr", "Lundvek", "Skog", "Viddreth"] },
  {
    name: "Ristello",
    models: ["Albrisso", "Corvello", "Dorata", "Fumaro", "Nerosso", "Rivasso", "Velossa"],
  },
];

export interface Brand {
  name: string;
  tier: BrandTier;
}

const OE_BRANDS = ["Torbenna", "Feldrin", "Corvelth", "Zelmatic", "Ordanti"];
const PREMIUM_BRANDS = [
  "Halstrom",
  "Marvonex",
  "Kalopex",
  "Brevalta",
  "Quorline",
  "Dunmoor",
  "Sivrenta",
  "Portalen",
  "Marquell",
  "Ebrindo",
  "Tyvane",
  "Lorrexa",
];
const STANDARD_BRANDS = [
  "Tremosk",
  "Bolverra",
  "Cadrell",
  "Dorvik",
  "Estrivane",
  "Fabrenne",
  "Galvane",
  "Hestrom",
  "Ivorn",
  "Jastel",
  "Kentrova",
  "Lumbrix",
  "Morvent",
  "Norvelda",
  "Ostrik",
  "Pulvane",
  "Quintaro",
  "Rembrix",
  "Sabrenn",
  "Truvenko",
  "Ulmaro",
  "Wendrick",
  "Zabrin",
];

/** 40 brands: 5 oe, 12 premium, 23 standard. */
export const BRANDS: readonly Brand[] = [
  ...OE_BRANDS.map((name): Brand => ({ name, tier: "oe" })),
  ...PREMIUM_BRANDS.map((name): Brand => ({ name, tier: "premium" })),
  ...STANDARD_BRANDS.map((name): Brand => ({ name, tier: "standard" })),
];

export interface Supplier {
  id: string;
  name: string;
}

export const SUPPLIERS: readonly Supplier[] = [
  { id: "s_01", name: "Brenholt Distribution" },
  { id: "s_02", name: "Calmere Autoparts" },
  { id: "s_03", name: "Drenvalo Supply" },
  { id: "s_04", name: "Ferbrisco Trade" },
  { id: "s_05", name: "Lonvaske Logistics" },
  { id: "s_06", name: "Vantrelo Parts" },
];

export const EQUIPMENT_CODES: readonly string[] = ["BRK-L", "SUS-S", "AC", "TOW", "LED", "AWD"];
