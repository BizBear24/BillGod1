import * as schema from "./schema";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Driver-swap boundary: DATABASE_DRIVER selects the Postgres backend.
 *
 * "pglite"   (default, dev) — embedded Postgres compiled to WASM, file-backed,
 *            no install/Docker/account needed. Real Postgres SQL underneath.
 * "postgres" (production)   — postgres.js against a real hosted Postgres URL.
 *
 * Schema and queries are plain drizzle-orm/pg-core, so switching drivers is
 * a config change only. Never branch business logic on which driver is active.
 * Both drivers share the same query builder shape, so callers get full
 * type-safe query results regardless of which one is active.
 */
export type AppDb = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

declare global {
  var __billgodDbPromise: Promise<AppDb> | undefined;
}

async function init(): Promise<AppDb> {
  const driver = process.env.DATABASE_DRIVER ?? "pglite";

  if (driver === "postgres") {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required when DATABASE_DRIVER=postgres");
    }
    const client = postgres(url, { max: 10 });
    return drizzle(client, { schema });
  }

  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR ?? "./.data/billgod-db";
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: "./drizzle" });

  // PGlite buffers writes in a virtual filesystem before syncing to disk, so
  // an abrupt kill can lose very recent writes — close() flushes that sync on
  // a normal shutdown (Ctrl+C, etc). This has no equivalent for the real
  // Postgres driver, which is why this block is pglite-only.
  let closing = false;
  const closeGracefully = async () => {
    if (closing) return;
    closing = true;
    await client.close();
    process.exit(0);
  };
  process.once("SIGINT", closeGracefully);
  process.once("SIGTERM", closeGracefully);

  return db;
}

export function getDb(): Promise<AppDb> {
  if (!global.__billgodDbPromise) {
    global.__billgodDbPromise = init();
  }
  return global.__billgodDbPromise;
}
