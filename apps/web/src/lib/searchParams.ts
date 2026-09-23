import { Axle, SearchSort } from "@passform/contracts";

/**
 * The URL owns the selected vehicle, filters, sort and page. This codec is the
 * only place that knows the parameter names; components read the decoded
 * state and write back through `encodeSearchParams`. Junk never throws: an
 * unknown value falls back to its default.
 */

export interface SearchState {
  variantId: string | null;
  q: string;
  category: string;
  brand: string;
  axle: Axle | null;
  sort: SearchSort;
  page: number;
}

export const DEFAULT_SEARCH_STATE: SearchState = {
  variantId: null,
  q: "",
  category: "",
  brand: "",
  axle: null,
  sort: "default",
  page: 1,
};

/** What Next hands an App Router page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function decodeSearchParams(input: URLSearchParams | RawSearchParams): SearchState {
  const get = (name: string): string => first(input, name).trim();

  const axle = Axle.safeParse(get("axle"));
  const sort = SearchSort.safeParse(get("sort"));
  const page = Number(get("page"));

  return {
    variantId: get("variant") || null,
    q: get("q"),
    category: get("category"),
    brand: get("brand"),
    axle: axle.success ? axle.data : null,
    sort: sort.success ? sort.data : DEFAULT_SEARCH_STATE.sort,
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_SEARCH_STATE.page,
  };
}

/** Defaults and empty filters are left out so the URL stays short and canonical. */
export function encodeSearchParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.variantId) params.set("variant", state.variantId);
  if (state.q) params.set("q", state.q);
  if (state.category) params.set("category", state.category);
  if (state.brand) params.set("brand", state.brand);
  if (state.axle) params.set("axle", state.axle);
  if (state.sort !== DEFAULT_SEARCH_STATE.sort) params.set("sort", state.sort);
  if (state.page !== DEFAULT_SEARCH_STATE.page) params.set("page", String(state.page));
  return params;
}

/** The `/parts` URL for a state; every filter control and pagination link goes through here. */
export function partsHref(state: SearchState): string {
  const query = encodeSearchParams(state).toString();
  return query ? `/parts?${query}` : "/parts";
}

function first(input: URLSearchParams | RawSearchParams, name: string): string {
  if (input instanceof URLSearchParams) return input.get(name) ?? "";
  const value = input[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
