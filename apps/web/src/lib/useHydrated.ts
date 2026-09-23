import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the snapshot only differs between server and client. */
function subscribe(): () => void {
  return () => undefined;
}

/** False during SSR and the hydration render, true afterwards; for browser-only state such as the cart. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
