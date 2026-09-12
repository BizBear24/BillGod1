import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Prefer unpooled connection for migrations (DDL requires a direct connection, not a pooler)
  dbCredentials: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)
    ? { url: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)! }
    : undefined,
});
