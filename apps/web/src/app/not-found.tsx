import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-sm">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mt-1">Nothing lives at this address.</p>
      <Link href="/" className="mt-3 inline-block text-link underline">
        Choose a vehicle
      </Link>
    </div>
  );
}
