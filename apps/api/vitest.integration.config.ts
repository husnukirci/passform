import { defineConfig } from "vitest/config";

// Integration tests run against the docker-compose services. They share a
// database, so files run one at a time and each truncates its own tables.
export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    fileParallelism: false,
    passWithNoTests: true,
  },
});
