// Push onboarding-rules.md into the database as the next version.
//
//   npm run rules:push
//
// The AI reads the newest version on every check, so an edit takes effect
// straight away. Old versions are kept. Once the admin dashboard is built the
// rules will be edited there instead, and this script can go.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const file = join(process.cwd(), "onboarding-rules.md");
const content = readFileSync(file, "utf8").trim();

if (content.length < 100) {
  console.error("onboarding-rules.md is empty or far too short. Nothing pushed.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("No DATABASE_URL. Nothing pushed.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const { rows } = await client.query(
  "select version, content from public.onboarding_rules order by version desc limit 1",
);
const latest = rows[0];

if (latest && latest.content.trim() === content) {
  console.log(`Nothing to do: version ${latest.version} already says this.`);
  await client.end();
  process.exit(0);
}

const version = (latest?.version ?? 0) + 1;
await client.query(
  "insert into public.onboarding_rules (version, content) values ($1, $2)",
  [version, content],
);

console.log(`Pushed version ${version}. The AI follows it from the next check.`);
await client.end();
