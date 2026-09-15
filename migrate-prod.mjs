import { readFileSync } from "fs";
import { createRequire } from "module";
import { resolve, join } from "path";

const require = createRequire(import.meta.url);

// Parse .env.local
const raw = readFileSync(".env.local", "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}

const url = env["DATABASE_URL_UNPOOLED"] || env["DATABASE_URL"];
if (!url) { console.error("No DATABASE_URL found in .env.local"); process.exit(1); }

console.log("Connecting to Neon (unpooled)...");
const postgres = require("postgres");
const sql = postgres(url, { ssl: "require", max: 1, connect_timeout: 30 });

await sql`
  CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    created_at BIGINT
  )
`;

const applied = await sql`SELECT hash FROM "__drizzle_migrations"`;
const appliedSet = new Set(applied.map(r => r.hash));

const journal = JSON.parse(readFileSync(join(resolve("drizzle"), "meta/_journal.json"), "utf8"));

let count = 0;
for (const entry of journal.entries) {
  if (appliedSet.has(entry.tag)) {
    console.log(`  skip ${entry.tag}`);
    continue;
  }
  const sqlFile = join(resolve("drizzle"), `${entry.tag}.sql`);
  let sqlText;
  try { sqlText = readFileSync(sqlFile, "utf8"); } catch {
    console.warn(`  warn: ${entry.tag}.sql not found, skipping`);
    continue;
  }
  console.log(`  apply ${entry.tag}...`);
  const statements = sqlText.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
  await sql`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (${entry.tag}, ${Date.now()})`;
  count++;
}

await sql.end();
console.log(`Done — ${count} migration(s) applied.`);
