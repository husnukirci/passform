import { defineConfig } from "drizzle-kit";

// Migrations are generated from src/infra/db/schema.ts into ./drizzle and
// committed (ADR 2). `drizzle-kit generate` needs no database; the url is
// only read by commands that connect.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infra/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://passform:passform@localhost:5432/passform",
  },
  strict: true,
  verbose: true,
});
