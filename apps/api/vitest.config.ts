import { defineConfig } from "vitest/config";

// Nest's dependency injection needs `emitDecoratorMetadata`; vitest 5's
// transformer honours the flag from tsconfig.json, so no extra plugin.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
