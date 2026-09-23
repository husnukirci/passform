import { builtinModules } from "node:module";

import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Packages the pure domain core must never import. Enforces the CLAUDE.md
// invariant mechanically instead of by grep.
const DOMAIN_FORBIDDEN_IMPORTS = [
  {
    group: [...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
    message: "packages/domain must not use Node built-ins.",
  },
  {
    group: ["@nestjs/*", "next", "next/*", "drizzle-orm", "drizzle-orm/*", "zod", "bullmq"],
    message: "packages/domain is framework-free: plain data in, plain data out.",
  },
  {
    group: ["@elastic/elasticsearch", "@elastic/*"],
    message:
      "packages/domain emits the Elasticsearch body as a plain object; it never talks to Elasticsearch.",
  },
];

// The web app talks to the API over HTTP only.
const WEB_FORBIDDEN_IMPORTS = [
  {
    group: ["drizzle-orm", "drizzle-orm/*", "pg", "postgres", "ioredis", "bullmq", "@elastic/*"],
    message: "apps/web reaches the backend only through src/lib/api.ts.",
  },
];

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/.next/",
    "**/.tsout/",
    "**/next-env.d.ts",
    ".data/",
  ]),

  js.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,

  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Allowed only with an eslint-disable comment that explains why.
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: ["packages/domain/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: DOMAIN_FORBIDDEN_IMPORTS }],
    },
  },

  {
    files: ["apps/api/**/*.ts"],
    languageOptions: {
      globals: globals.node,
      // Nest resolves constructor and handler parameters from decorator
      // metadata, so a class used only as a parameter type must stay a value
      // import; these flags tell consistent-type-imports about it.
      parserOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
    },
    rules: {
      // Nest modules are empty classes that exist for their decorator.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    },
  },

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [nextVitals, nextTs],
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      "no-restricted-imports": ["error", { patterns: WEB_FORBIDDEN_IMPORTS }],
    },
  },

  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },

  // Last: turns off rules that conflict with Prettier.
  prettier,
]);
