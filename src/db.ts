import type { Pool } from "pg";

// Real Postgres when DATABASE_URL is set, in-memory Postgres emulation otherwise (dev and tests).
export async function makePool(url?: string): Promise<Pool> {
  if (url) {
    const pg = await import("pg");
    return new pg.default.Pool({
      connectionString: url,
      ssl: process.env.PGSSL === "on" ? { rejectUnauthorized: false } : false,
    });
  }
  const { newDb } = await import("pg-mem");
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as Pool;
}

export async function migrate(pool: Pool) {
  await pool.query(`create table if not exists attendees (
    id serial primary key,
    code text unique not null,
    nickname text,
    created_at timestamptz default now(),
    donut_claimed_at timestamptz
  )`);
  await pool.query(`create table if not exists stations (
    id text primary key,
    name text not null,
    kind text not null,
    pin text not null,
    sort int not null
  )`);
  await pool.query(`create table if not exists stamps (
    attendee_id int not null,
    stall_id text not null,
    swag_given boolean not null default false,
    created_at timestamptz default now(),
    primary key (attendee_id, stall_id)
  )`);
  await pool.query(`create table if not exists settings (
    key text primary key,
    value text not null
  )`);
}
