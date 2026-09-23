/** Skeleton rows while the search answers; shaped like the results so nothing jumps. */
export default function PartsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading parts">
      <div className="h-8 w-48 animate-pulse rounded bg-surface" />
      <div className="h-9 animate-pulse rounded border border-border bg-surface" />
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-surface" />
          ))}
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="space-y-2 p-3">
              <div className="h-3 w-40 animate-pulse rounded bg-surface" />
              <div className="h-4 w-72 animate-pulse rounded bg-surface" />
              <div className="h-5 w-96 max-w-full animate-pulse rounded bg-surface" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
