import Link from "next/link";

export default function OrderNotFound() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-sm">
      <h1 className="text-lg font-semibold">Order not found</h1>
      <p className="mt-1">No order has this id.</p>
      <Link href="/cart" className="mt-3 inline-block text-link underline">
        Back to the cart
      </Link>
    </div>
  );
}
