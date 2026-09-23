import type { Metadata } from "next";
import { Suspense } from "react";

import { ImportsView } from "@/components/imports/ImportsView";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Supplier imports</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          A file is split into 1,000-row chunks that upsert parts and fitments idempotently on the
          queue; search keeps answering from the old index until the rebuild swaps the alias.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ImportsView />
      </Suspense>
    </div>
  );
}
