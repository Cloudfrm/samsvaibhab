import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dir = join(process.cwd(), "supabase", "migrations");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(
  "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
);

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
