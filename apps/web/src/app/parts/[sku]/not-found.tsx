import Link from "next/link";

export default function PartNotFound() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-sm">
      <h1 className="text-lg font-semibold">Part not found</h1>
      <p className="mt-1">No part has this SKU, or the selected vehicle is unknown.</p>
      <Link href="/parts" className="mt-3 inline-block text-link underline">
        Back to results
      </Link>
    </div>
  );
}
