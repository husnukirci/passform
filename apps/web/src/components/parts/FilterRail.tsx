"use client";

import { Axle, type CategoryNode, SearchSort } from "@passform/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId } from "react";

import { DEFAULT_SEARCH_STATE, partsHref, type SearchState } from "@/lib/searchParams";

import { SORT_DESCRIPTION } from "./StageStrip";

interface Props {
  state: SearchState;
  categories: CategoryNode[];
}

/** Every control writes the URL and nothing else; the page re-renders from it. */
export function FilterRail({ state, categories }: Props) {
  const router = useRouter();
  const ids = { q: useId(), brand: useId(), category: useId(), sort: useId(), axle: useId() };

  const apply = (patch: Partial<SearchState>): void => {
    router.replace(partsHref({ ...state, ...patch, page: 1 }), { scroll: false });
  };

  const onTextSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    apply({
      q: String(form.get("q") ?? "").trim(),
      brand: String(form.get("brand") ?? "").trim(),
    });
  };

  const hasFilters =
    state.q !== "" ||
    state.brand !== "" ||
    state.category !== "" ||
    state.axle !== null ||
    state.sort !== DEFAULT_SEARCH_STATE.sort;
  const inputClass = "mt-1 w-full rounded border border-border bg-background px-2 py-1";

  return (
    <aside aria-label="Filters" className="space-y-5 text-sm">
      {/* Text filters commit on submit, so no state mirrors the URL while typing. */}
      <form onSubmit={onTextSubmit} key={`${state.q}|${state.brand}`} className="space-y-3">
        <label className="block" htmlFor={ids.q}>
          Search
          <input
            id={ids.q}
            name="q"
            type="search"
            defaultValue={state.q}
            placeholder="name, SKU or OE reference"
            className={inputClass}
          />
        </label>
        <label className="block" htmlFor={ids.brand}>
          Brand
          <input
            id={ids.brand}
            name="brand"
            type="text"
            defaultValue={state.brand}
            placeholder="exact brand name"
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="rounded border border-border px-3 py-1 font-medium hover:border-accent"
        >
          Apply
        </button>
      </form>

      <label className="block" htmlFor={ids.category}>
        Category
        <select
          id={ids.category}
          value={state.category}
          onChange={(event) => apply({ category: event.target.value })}
          className={inputClass}
        >
          <option value="">All categories</option>
          {flatten(categories).map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {`${"  ".repeat(depth)}${node.name}`}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Axle</legend>
        <div className="mt-1 flex gap-4">
          {[null, ...Axle.options].map((axle) => (
            <label key={axle ?? "any"} className="inline-flex items-center gap-1">
              <input
                type="radio"
                name={ids.axle}
                checked={state.axle === axle}
                onChange={() => apply({ axle })}
              />
              {axle ?? "any"}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block" htmlFor={ids.sort}>
        Sort
        <select
          id={ids.sort}
          value={state.sort}
          onChange={(event) => apply({ sort: SearchSort.parse(event.target.value) })}
          className={inputClass}
        >
          {SearchSort.options.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_DESCRIPTION[sort]}
            </option>
          ))}
        </select>
      </label>

      {hasFilters && (
        <Link
          href={partsHref({ ...DEFAULT_SEARCH_STATE, variantId: state.variantId })}
          className="inline-block text-link underline"
        >
          Clear filters
        </Link>
      )}
    </aside>
  );
}

/** Depth-first, so a `<select>` can show the tree with indentation. */
function flatten(nodes: CategoryNode[], depth = 0): { node: CategoryNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}
