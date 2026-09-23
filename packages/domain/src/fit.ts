import type { Axle, FitResult, Fitment, Part, VehicleVariant } from "./types.ts";
import { withinWindow } from "./yearMonth.ts";

/**
 * How far a row got through the restriction order before it failed. A
 * higher stage is a more specific "no", and wins when several rows fail.
 */
const STAGE = { variant: 0, window: 1, axle: 2, equipment: 3 } as const;

const NO_FITMENT = "No fitment for this vehicle";

type RowOutcome =
  | { result: "fits"; reason: string }
  | { result: "ask"; reason: string; equipmentCode: string }
  | { result: "no"; reason: string; stage: number };

/**
 * Evaluates a part's fitment rows against one variant. Restrictions are
 * checked in a fixed order (variant, build window, axle, equipment) and the
 * rows are folded with fits > ask > no. Inputs are never mutated.
 */
export function evaluateFit(
  variant: VehicleVariant,
  part: Pick<Part, "sku" | "universal">,
  fitments: Fitment[],
  chosenAxle: Axle | null,
): FitResult {
  if (part.universal) {
    return { result: "fits", reason: "Universal part, fits every vehicle" };
  }

  let ask: RowOutcome | null = null;
  let furthestNo: (RowOutcome & { result: "no" }) | null = null;

  for (const row of fitments) {
    const outcome = evaluateRow(variant, row, chosenAxle);
    if (outcome.result === "fits") {
      return outcome;
    }
    if (outcome.result === "ask") {
      ask ??= outcome;
    } else if (furthestNo === null || outcome.stage > furthestNo.stage) {
      furthestNo = outcome;
    }
  }

  if (ask !== null) return ask;
  if (furthestNo !== null) return { result: "no", reason: furthestNo.reason };
  return { result: "no", reason: NO_FITMENT };
}

function evaluateRow(variant: VehicleVariant, row: Fitment, chosenAxle: Axle | null): RowOutcome {
  if (row.variantId !== variant.id) {
    return { result: "no", stage: STAGE.variant, reason: NO_FITMENT };
  }

  if (!withinWindow(variant.buildFrom, row.buildFrom, row.buildTo)) {
    return {
      result: "no",
      stage: STAGE.window,
      reason: `Not for vehicles built ${variant.buildFrom}; this part covers ${row.buildFrom ?? "any"} → ${row.buildTo ?? "any"}`,
    };
  }

  if (row.axle !== null && chosenAxle !== null && row.axle !== chosenAxle) {
    return { result: "no", stage: STAGE.axle, reason: `Only for the ${row.axle} axle` };
  }

  if (row.equipmentCode !== null) {
    if (variant.equipment.length === 0) {
      return {
        result: "ask",
        equipmentCode: row.equipmentCode,
        reason: `Fits if the vehicle has equipment ${row.equipmentCode}; confirm before ordering`,
      };
    }
    if (!variant.equipment.includes(row.equipmentCode)) {
      return {
        result: "no",
        stage: STAGE.equipment,
        reason: `Requires equipment ${row.equipmentCode}, which this vehicle does not have`,
      };
    }
  }

  const window = `${variant.buildFrom} → ${variant.buildTo ?? "today"}`;
  const axle = row.axle === null ? "" : ` on the ${row.axle} axle`;
  return {
    result: "fits",
    reason: `Fits ${variant.make} ${variant.model} ${variant.engineCode} (${window})${axle}`,
  };
}
