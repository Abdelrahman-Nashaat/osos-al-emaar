/**
 * Applies every supabase/migrations/*.sql (in filename order) to a target DB
 * via a direct Postgres connection. Reads files from disk → zero transcription.
 *
 * Usage: DEMO_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" \
 *        node scripts/demo/apply-migrations.mjs
 *
 * Safety: refuses to run against the clean/production project ref.
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Explicit fields (password passed raw, not URI-encoded — it can contain # and spaces).
const HOST = process.env.DEMO_DB_HOST ?? "";
const USER = process.env.DEMO_DB_USER ?? "";
const PASSWORD = process.env.DEMO_DB_PASSWORD ?? "";
const PORT = Number(process.env.DEMO_DB_PORT ?? "5432");
const PROTECTED_REF = "anqrrhqjkmvaymvkdjtj";
if (!HOST || !USER || !PASSWORD) {
  console.error("Missing DEMO_DB_HOST / DEMO_DB_USER / DEMO_DB_PASSWORD");
  process.exit(1);
}
if (`${HOST}${USER}`.includes(PROTECTED_REF)) {
  console.error("REFUSING: connection targets the protected clean/production project.");
  process.exit(1);
}

const dir = join("supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

// Verify TLS against the genuine Supabase Root 2021 CA chain (extracted from the
// live pooler handshake and inspected: Supabase Root 2021 CA → Intermediate →
// *.pooler.supabase.com). Full verification, no disabling.
const ca = readFileSync("./.sb-ca.pem", "utf8");
const client = new Client({
  host: HOST,
  port: PORT,
  user: USER,
  password: PASSWORD,
  database: "postgres",
  ssl: { ca, rejectUnauthorized: true },
});

async function main() {
  await client.connect();
  console.log(`Applying ${files.length} migrations…`);
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    process.stdout.write(`  ${f} … `);
    try {
      await client.query(sql);
      console.log("ok");
    } catch (e) {
      console.log("FAILED");
      console.error(`\n${f}: ${e.message}\n`);
      throw e;
    }
  }
  console.log("All migrations applied.");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
