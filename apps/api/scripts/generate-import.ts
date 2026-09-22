// Emits a supplier import file for the pipeline.
//   npm run data:generate-import -- --rows N [--supplier s_01] [--from DIR] [--out FILE]
// 70% of rows update SKUs that exist in DIR/parts.jsonl (price, stock and
// one fitment), 30% are new SKUs. Every row validates with the domain's
// validateImportRow. Deterministic for the same arguments.

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

import {
  type Fitment,
  type ImportRow,
  type VehicleVariant,
  validateImportRow,
} from "@passform/domain";

import { JsonlWriter, readJsonl } from "./jsonl.js";
import { dataDir, userPath } from "./paths.js";
import { Rng } from "./prng.js";
import {
  indexVariants,
  type PartLine,
  synthPart,
  synthWindow,
  type VariantIndex,
  variantId,
} from "./synth.js";

export interface GenerateImportOptions {
  rows: number;
  supplier: string;
  from: string;
  out: string;
}

export interface GenerateImportResult {
  rows: number;
  updates: number;
  created: number;
}

const UPDATE_RATE = 0.7;
/** New SKUs are numbered from here so they never collide with a profile's parts. */
const NEW_PART_OFFSET = 10_000_000;

export async function generateImportFile(
  options: GenerateImportOptions,
): Promise<GenerateImportResult> {
  const rng = new Rng();
  const index = indexVariants(
    await collect(readJsonl<VehicleVariant>(join(options.from, "variants.jsonl"))),
  );
  const existing = cycle(() => readJsonl<PartLine>(join(options.from, "parts.jsonl")));

  await mkdir(dirname(options.out), { recursive: true });
  const writer = new JsonlWriter(options.out);
  let updatesLeft = Math.round(options.rows * UPDATE_RATE);
  let createdLeft = options.rows - updatesLeft;
  const result: GenerateImportResult = { rows: 0, updates: 0, created: 0 };

  while (updatesLeft > 0 || createdLeft > 0) {
    let row: ImportRow;
    if (updatesLeft > 0 && (createdLeft === 0 || rng.chance(UPDATE_RATE))) {
      const next = await existing.next();
      if (next.done) throw new Error("parts.jsonl is empty; nothing to update");
      row = updatedRow(rng, next.value, index);
      updatesLeft -= 1;
      result.updates += 1;
    } else {
      row = toImportRow(synthPart(rng, NEW_PART_OFFSET + result.created + 1, index));
      createdLeft -= 1;
      result.created += 1;
    }

    const verdict = validateImportRow(row);
    if (!verdict.ok) throw new Error(`generated an invalid row: ${verdict.errors.join("; ")}`);
    await writer.write(row);
    result.rows += 1;
  }

  await writer.close();
  return result;
}

function toImportRow(line: PartLine): ImportRow {
  const { id: _id, supplierId: _supplierId, ...row } = line;
  return row;
}

/** Same SKU, new price and stock, and one fitment added or re-windowed. */
function updatedRow(rng: Rng, line: PartLine, index: VariantIndex): ImportRow {
  const row = toImportRow(line);
  const priceCents = Math.max(
    10,
    Math.round((row.priceCents * (0.9 + rng.float() * 0.2)) / 10) * 10,
  );
  let stockQty = rng.int(0, 80);
  if (stockQty === row.stockQty) stockQty += 1;

  let fitments = row.fitments;
  if (!row.universal) {
    fitments = rng.chance(0.5)
      ? withAddedFitment(rng, row.fitments, index)
      : withChangedWindow(rng, row.fitments, index);
  }

  return { ...row, priceCents, stockQty, fitments };
}

function withAddedFitment(rng: Rng, fitments: Fitment[], index: VariantIndex): Fitment[] {
  const pos = rng.int(0, index.windows.length - 1);
  return [
    ...fitments,
    {
      variantId: variantId(pos + 1),
      buildFrom: null,
      buildTo: null,
      axle: null,
      equipmentCode: null,
    },
  ];
}

function withChangedWindow(rng: Rng, fitments: Fitment[], index: VariantIndex): Fitment[] {
  if (fitments.length === 0) return fitments;
  const at = rng.int(0, fitments.length - 1);
  return fitments.map((fitment, i) => {
    if (i !== at) return fitment;
    const window = index.windows[positionOf(fitment.variantId)];
    if (!window) return fitment;
    return { ...fitment, ...synthWindow(rng, window) };
  });
}

function positionOf(id: string): number {
  return Number(id.slice(2)) - 1;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** Iterates `open()` again whenever it runs out, so a short file can feed a long import. */
async function* cycle<T>(open: () => AsyncIterable<T>): AsyncGenerator<T> {
  for (;;) {
    let yielded = false;
    for await (const item of open()) {
      yielded = true;
      yield item;
    }
    if (!yielded) return;
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      rows: { type: "string", default: "1000" },
      supplier: { type: "string", default: "s_01" },
      from: { type: "string" },
      out: { type: "string" },
    },
  });
  const rows = Number(values.rows);
  if (!Number.isInteger(rows) || rows < 1)
    throw new Error(`--rows: expected a positive integer, got "${values.rows}"`);
  const from = values.from ? userPath(values.from) : join(dataDir(), "small");
  const out = values.out
    ? userPath(values.out)
    : join(dataDir(), "imports", `${values.supplier}-${rows}.jsonl`);

  const started = performance.now();
  const result = await generateImportFile({ rows, supplier: values.supplier, from, out });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`wrote ${result.rows} rows for ${values.supplier} to ${out} in ${seconds}s`);
  console.log(JSON.stringify(result));
}
