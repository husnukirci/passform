// Deterministic dataset generator.
//   npm run data:generate -- --profile small|large [--out DIR]
// Writes variants.jsonl, categories.json, suppliers.json and parts.jsonl
// into DIR (default $DATA_DIR/<profile>). Same profile, same bytes.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { CATEGORIES } from "./categories.js";
import { JsonlWriter } from "./jsonl.js";
import { SUPPLIERS } from "./names.js";
import { dataDir, userPath } from "./paths.js";
import { Rng } from "./prng.js";
import {
  indexVariants,
  isProfileName,
  type ProfileName,
  PROFILES,
  synthPart,
  synthVariants,
  type VariantIndex,
} from "./synth.js";

export interface GenerateOptions {
  profile: ProfileName;
  out: string;
}

export interface GenerateResult {
  variants: number;
  parts: number;
  fitments: number;
  categories: number;
  suppliers: number;
}

export async function generateDataset({ profile, out }: GenerateOptions): Promise<GenerateResult> {
  const sizes = PROFILES[profile];
  const rng = new Rng();
  await mkdir(out, { recursive: true });

  await writeFile(join(out, "categories.json"), `${JSON.stringify(CATEGORIES, null, 2)}\n`);
  await writeFile(join(out, "suppliers.json"), `${JSON.stringify(SUPPLIERS, null, 2)}\n`);

  const variantsOut = new JsonlWriter(join(out, "variants.jsonl"));
  const collected = [];
  for (const variant of synthVariants(rng, sizes.variants)) {
    await variantsOut.write(variant);
    collected.push(variant);
  }
  await variantsOut.close();
  // Only the build windows and make ranges stay in memory; parts stream.
  const index: VariantIndex = indexVariants(collected);
  collected.length = 0;

  const partsOut = new JsonlWriter(join(out, "parts.jsonl"));
  let fitments = 0;
  for (let n = 1; n <= sizes.parts; n += 1) {
    const part = synthPart(rng, n, index);
    fitments += part.fitments.length;
    await partsOut.write(part);
  }
  await partsOut.close();

  return {
    variants: variantsOut.count,
    parts: partsOut.count,
    fitments,
    categories: CATEGORIES.length,
    suppliers: SUPPLIERS.length,
  };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      profile: { type: "string", default: "small" },
      out: { type: "string" },
    },
  });
  if (!isProfileName(values.profile)) {
    throw new Error(`--profile: expected small or large, got "${values.profile}"`);
  }
  const out = values.out ? userPath(values.out) : join(dataDir(), values.profile);

  const started = performance.now();
  const result = await generateDataset({ profile: values.profile, out });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`generated ${values.profile} profile into ${out} in ${seconds}s`);
  console.log(JSON.stringify(result));
}
