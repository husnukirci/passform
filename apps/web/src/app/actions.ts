"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { VEHICLE_COOKIE, VEHICLE_COOKIE_MAX_AGE_SECONDS } from "@/lib/vehicle";

/**
 * Picks the vehicle: the URL owns the selection, the cookie remembers it for
 * pages reached without a `variant` parameter. Called from the picker.
 */
export async function selectVehicle(variantId: string): Promise<void> {
  const id = variantId.trim();
  if (id.length === 0 || id.length > 64) return;

  (await cookies()).set(VEHICLE_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    maxAge: VEHICLE_COOKIE_MAX_AGE_SECONDS,
  });
  redirect(`/parts?variant=${encodeURIComponent(id)}`);
}
