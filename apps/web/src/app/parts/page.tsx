import { CategoriesResponse, SearchResponse } from "@passform/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FilterRail } from "@/components/parts/FilterRail";
import { Pagination } from "@/components/parts/Pagination";
import { ResultsList } from "@/components/parts/ResultsList";
import { StageStrip } from "@/components/parts/StageStrip";
import { ApiError, apiFetch } from "@/lib/api";
import {
  DEFAULT_SEARCH_STATE,
  decodeSearchParams,
  partsHref,
  type RawSearchParams,
  type SearchState,
} from "@/lib/searchParams";
import { cookieVariantId } from "@/lib/vehicle.server";

export const metadata: Metadata = { title: "Parts" };

interface Props {
  searchParams: Promise<RawSearchParams>;
}

export default async function PartsPage({ searchParams }: Props) {
  const decoded = decodeSearchParams(await searchParams);
  const variantId = decoded.variantId;
  if (variantId === null) {
    // The URL owns the selection; the cookie only fills it in when it is missing.
    const remembered = await cookieVariantId();
    redirect(remembered === null ? "/" : partsHref({ ...decoded, variantId: remembered }));
  }
  const state = { ...decoded, variantId };

  const [result, { categories }] = await Promise.all([
    search(state),
    apiFetch("/categories", CategoriesResponse),
  ]);

  if (result === null) {
    return (
      <div className="rounded-lg border border-fit-no-bg bg-surface p-6 text-sm">
        <h1 className="text-lg font-semibold">Unknown vehicle</h1>
        <p className="mt-1">
          No vehicle has the id <code className="font-mono">{state.variantId}</code>.
        </p>
        <Link href="/" className="mt-3 inline-block text-link underline">
          Choose a vehicle
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Parts that fit</h1>
      <StageStrip fitted={result.stages.fitted} shown={result.stages.shown} sort={state.sort} />
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <FilterRail state={state} categories={categories} />
        <section aria-label="Results" className="space-y-4">
          {result.hits.length === 0 ? (
            <EmptyResults state={state} fitted={result.stages.fitted} />
          ) : (
            <ResultsList hits={result.hits} variantId={state.variantId} />
          )}
          <Pagination state={state} fitted={result.stages.fitted} pageSize={result.pageSize} />
        </section>
      </div>
    </div>
  );
}

/** Null for an unknown vehicle; every other failure reaches the error boundary. */
async function search(state: SearchState & { variantId: string }): Promise<SearchResponse | null> {
  const query = new URLSearchParams({ variantId: state.variantId });
  if (state.q) query.set("q", state.q);
  if (state.category) query.set("category", state.category);
  if (state.brand) query.set("brand", state.brand);
  if (state.axle) query.set("axle", state.axle);
  if (state.sort !== DEFAULT_SEARCH_STATE.sort) query.set("sort", state.sort);
  if (state.page !== DEFAULT_SEARCH_STATE.page) query.set("page", String(state.page));

  try {
    return await apiFetch(`/search?${query}`, SearchResponse);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function EmptyResults({ state, fitted }: { state: SearchState; fitted: number }) {
  const beyondLastPage = fitted > 0;
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm">
      <p>
        {beyondLastPage ? "Nothing on this page." : "No parts fit this vehicle with these filters."}
      </p>
      <Link
        href={partsHref(
          beyondLastPage
            ? { ...state, page: 1 }
            : { ...DEFAULT_SEARCH_STATE, variantId: state.variantId },
        )}
        className="mt-2 inline-block text-link underline"
      >
        {beyondLastPage ? "Back to the first page" : "Clear filters"}
      </Link>
    </div>
  );
}
