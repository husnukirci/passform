import type { Metadata } from "next";

import { VehiclePicker } from "@/components/vehicle/VehiclePicker";

export const metadata: Metadata = { title: "Choose a vehicle" };

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Which vehicle?</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Parts are filtered by what fits before anything is ranked, so the search starts with the
          vehicle. Enter its registration key or pick it by make and model.
        </p>
      </div>
      <VehiclePicker />
    </div>
  );
}
