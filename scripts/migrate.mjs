import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dir = join(process.cwd(), "supabase", "migrations");

// This also runs during the build, so the database can never fall behind the
// code. Without a database address there is nothing to do: a normal local
// build should not stop because of it.
if (!process.env.DATABASE_URL) {
  console.log("no DATABASE_URL, skipping migrations");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(
  "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
);
// No policies on purpose: only the server, holding the secret key, can read it.
await client.query("alter table public.schema_migrations enable row level security");

const { rows } = await client.query("select name from public.schema_migrations");
const applied = new Set(rows.map((r) => r.name));

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) {
    console.log(`skip ${file}`);
    continue;
  }
  console.log(`running ${file}`);
  await client.query("begin");
  try {
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`done ${file}`);
  } catch (error) {
    await client.query("rollback");
    console.error(`failed ${file}`);
    throw error;
  }
}

await client.end();
