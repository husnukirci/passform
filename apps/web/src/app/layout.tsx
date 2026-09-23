import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";

import { CartLink } from "@/components/CartLink";
import { VehicleBar } from "@/components/VehicleBar";
import { VEHICLE_COOKIE } from "@/lib/vehicle";

import "./globals.css";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "passform", template: "%s · passform" },
  description: "Compatibility-driven parts catalogue. Synthetic data.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieVariantId = (await cookies()).get(VEHICLE_COOKIE)?.value ?? null;

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Providers>
          <header className="border-b border-border">
            <nav
              aria-label="Main"
              className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
            >
              <Link href="/" className="text-lg font-semibold tracking-tight">
                passform
              </Link>
              <div className="flex flex-wrap gap-x-4 text-sm">
                <Link href="/" className="hover:underline">
                  Vehicle
                </Link>
                <Link href="/parts" className="hover:underline">
                  Parts
                </Link>
                <CartLink />
                <Link href="/imports" className="hover:underline">
                  Imports
                </Link>
              </div>
            </nav>
          </header>
          <Suspense fallback={<div className="border-b border-border bg-surface py-2" />}>
            <VehicleBar cookieVariantId={cookieVariantId} />
          </Suspense>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
            Synthetic catalogue for a portfolio project. Every make, model, brand and supplier is
            invented; any resemblance to real ones is coincidental.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
