import type { SearchSort } from "@passform/contracts";

import { formatCount } from "@/lib/format";

export const SORT_DESCRIPTION: Record<SearchSort, string> = {
  default: "in stock first, then price",
  price_asc: "price ascending",
  price_desc: "price descending",
};

interface Props {
  fitted: number;
  shown: number;
  sort: SearchSort;
}

/** The two search stages, in one line: constrain by fitment, then rank the survivors. */
export function StageStrip({ fitted, shown, sort }: Props) {
  return (
    <p
      aria-live="polite"
      className="rounded border border-border bg-surface px-3 py-2 text-sm font-medium"
    >
      {`${formatCount(fitted)} fit your vehicle → ${formatCount(shown)} shown, ${SORT_DESCRIPTION[sort]}`}
    </p>
  );
}
