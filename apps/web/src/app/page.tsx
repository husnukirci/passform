import { HealthResponse } from "@passform/contracts";

import { ApiError, apiFetch } from "@/lib/api";

// The page reflects the live API, so it must not be prerendered at build time.
export const dynamic = "force-dynamic";

async function checkApi(): Promise<string> {
  try {
    const health = await apiFetch("/health", HealthResponse);
    return health.ok ? "api: ok" : "api: unexpected response";
  } catch (error) {
    if (error instanceof ApiError) {
      return `api: error ${error.status}`;
    }
    return "api: unreachable";
  }
}

export default async function HomePage() {
  const status = await checkApi();

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <p className="font-mono text-lg">{status}</p>
    </main>
  );
}
