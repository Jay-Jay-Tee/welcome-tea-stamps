import type { Pool } from "pg";

// Real Postgres when DATABASE_URL is set, in-memory Postgres emulation otherwise (dev and tests).
export async function makePool(url?: string): Promise<Pool> {
  if (url) {
    const pg = await import("pg");
    const pool = new pg.default.Pool({
      connectionString: url,
      ssl: process.env.PGSSL === "on" ? { rejectUnauthorized: false } : false,
    });
    // Without this, one dropped idle connection crashes the whole server.
    pool.on("error", (err) => console.error("postgres idle client error", err.message));
    return pool;
  }
  const { newDb } = await import("pg-mem");
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as Pool;
}

// Creates whatever tables are missing. Checks information_schema rather than "if not exists" so pg-mem (tests) can run it twice.
export async function migrate(pool: Pool) {
  const have = new Set(
    (await pool.query("select table_name from information_schema.tables where table_schema = 'public'")).rows.map((r) => r.table_name),
  );
  const create = (name: string, sql: string) => (have.has(name) ? undefined : pool.query(sql));
  await create("attendees", `create table attendees (
    id serial primary key,
    code text unique not null,
    nickname text,
    created_at timestamptz default now(),
    donut_claimed_at timestamptz
  )`);
  await create("stations", `create table stations (
    id text primary key,
    name text not null,
    kind text not null,
    secret text unique not null,
    sort int not null
  )`);
  await create("stamps", `create table stamps (
    attendee_id int not null,
    stall_id text not null,
    swag_given boolean not null default false,
    created_at timestamptz default now(),
    primary key (attendee_id, stall_id)
  )`);
  await create("settings", `create table settings (
    key text primary key,
    value text not null
  )`);
  // Bug hunt Hall of Fame: one row per card that solved it, in the order they solved it.
  await create("squashers", `create table squashers (
    attendee_id int primary key,
    name text not null,
    solved_at timestamptz default now()
  )`);
  await create("bug_missions", `create table bug_missions (
    attendee_id int primary key,
    seed int not null,
    stage int not null default 0,
    attempts int not null default 0,
    completed_at timestamptz,
    mistakes int not null default 0,
    reboots int not null default 0,
    started_at timestamptz default now()
  )`);
  // Columns added after the first deploy: add them to existing tables instead of recreating (keeps live data).
  const addColumn = async (table: string, column: string, type: string) => {
    const cols = (await pool.query("select column_name from information_schema.columns where table_name = $1", [table])).rows.map((r) => r.column_name);
    if (!cols.includes(column)) await pool.query(`alter table ${table} add column ${column} ${type}`);
  };
  await addColumn("bug_missions", "mistakes", "int not null default 0");
  await addColumn("bug_missions", "reboots", "int not null default 0");
  await addColumn("bug_missions", "started_at", "timestamptz");
  await addColumn("squashers", "seconds", "int");
  await addColumn("squashers", "hearts", "int");
}
