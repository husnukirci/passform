/**
 * Presentation-only formatting. Money is integer cents everywhere else; this
 * is the one place cents become a EUR string (CLAUDE.md invariant).
 */

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const count = new Intl.NumberFormat("en-IE");

export function formatEur(cents: number): string {
  return eur.format(cents / 100);
}

export function formatCount(n: number): string {
  return count.format(n);
}

/** `2011-08 → 2016-02`, or `2011-08 → now` for a variant still in production. */
export function formatWindow(from: string | null, to: string | null): string {
  return `${from ?? "any"} → ${to ?? (from === null ? "any" : "now")}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" });
}
