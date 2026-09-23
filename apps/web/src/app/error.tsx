"use client";

import Link from "next/link";

/** The route error boundary. Details stay in the console; the visitor gets a way forward. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-job-fail-bg bg-surface p-6 text-sm">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1">{error.message || "The API did not answer."}</p>
      <div className="mt-3 flex gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded border border-border px-3 py-1 font-medium hover:border-accent"
        >
          Try again
        </button>
        <Link href="/" className="self-center text-link underline">
          Start over
        </Link>
      </div>
    </div>
  );
}
