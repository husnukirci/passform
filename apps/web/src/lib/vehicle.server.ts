import { cookies } from "next/headers";

import { VEHICLE_COOKIE } from "./vehicle";

/** The vehicle remembered by the cookie, for pages reached without `?variant=`. Server only. */
export async function cookieVariantId(): Promise<string | null> {
  return (await cookies()).get(VEHICLE_COOKIE)?.value ?? null;
}
