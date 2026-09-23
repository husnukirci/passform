import { defineConfig } from "vitest/config";

// Pragmatic tests for the URL codec and the cart store, plus one smoke test
// per page; presentational components are otherwise untested by design.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
