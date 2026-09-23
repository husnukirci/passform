import { useTransition } from "react";

import { selectVehicle } from "@/app/actions";
import { useCartStore } from "@/state/cartStore";

/** Picks a vehicle: remembers it for the cart, then the server action sets the cookie and routes to /parts. */
export function useChooseVehicle(): { choose: (variantId: string) => void; pending: boolean } {
  const [pending, startTransition] = useTransition();
  const setVariant = useCartStore((state) => state.setVariant);

  const choose = (variantId: string): void => {
    setVariant(variantId);
    startTransition(async () => {
      await selectVehicle(variantId);
    });
  };

  return { choose, pending };
}
