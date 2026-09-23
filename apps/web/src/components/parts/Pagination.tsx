import Link from "next/link";

import { partsHref, type SearchState } from "@/lib/searchParams";

interface Props {
  state: SearchState;
  fitted: number;
  pageSize: number;
}

export function Pagination({ state, fitted, pageSize }: Props) {
  const pages = Math.max(1, Math.ceil(fitted / pageSize));
  const linkClass = "rounded border border-border px-3 py-1 hover:border-accent";
  const disabledClass = "rounded border border-border px-3 py-1 text-muted opacity-60";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
      {state.page > 1 ? (
        <Link href={partsHref({ ...state, page: state.page - 1 })} className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          ← Previous
        </span>
      )}
      <span>
        Page {state.page} of {pages}
      </span>
      {state.page < pages ? (
        <Link href={partsHref({ ...state, page: state.page + 1 })} className={linkClass}>
          Next →
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Next →
        </span>
      )}
    </nav>
  );
}
