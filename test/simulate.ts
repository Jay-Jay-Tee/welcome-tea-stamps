import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { loadConfig, validateConfig } from "../src/config.js";
import { makePool } from "../src/db.js";
import { ALPHABET, CODE_RE, isClean, randomCode } from "../src/codes.js";

// Codes: right alphabet, never rude. 100k samples.
for (let i = 0; i < 100_000; i++) {
  const c = randomCode(8);
  assert.ok(CODE_RE.test(c) && isClean(c), `bad code ${c}`);
}
assert.ok(!/[AEIOUL0134]/.test(ALPHABET), "no vowels or vowel lookalikes");
for (const bad of ["XFCKXXXX", "BTCH2222", "B7CHZZZZ", "ZZ69ZZZZ", "SH7ZZZZZ", "5HTBBBBB"]) assert.equal(isClean(bad), false, bad);
assert.equal(isClean("FCWD8BYQ"), true);

const cfg = loadConfig();
const pool = await makePool();
const app = await createApp(pool, cfg, "admin");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
};
const admin = { "x-admin-pin": "admin" };

const stats = (await call("GET", "/api/admin/stats", undefined, admin)).body;
const pins: Record<string, string> = Object.fromEntries(stats.stations.map((s: any) => [s.id, s.secret]));
const donutPin = pins[cfg.reward.station.id];
assert.equal(new Set(Object.values(pins)).size, cfg.stalls.length + 1, "every station has its own key");
assert.ok(Object.values(pins).every((k) => /^[B-DF-HJKMNP-TV-Z25-9]{16}$/.test(k) && isClean(k)), "keys are 16 clean characters");
const N = 200;
const need = cfg.reward.stampsRequired;

// 200 attendees, each visits a random number of stalls in random order. Every stamp is sent twice, in parallel.
const cards: { code: string; visits: string[] }[] = [];
for (let i = 0; i < N; i++) {
  const c = (await call("POST", "/api/cards", i % 2 ? { nickname: `p${i}` } : {})).body;
  const n = i < 120 ? need : Math.floor(Math.random() * need);
  const visits = [...cfg.stalls].sort(() => Math.random() - 0.5).slice(0, n).map((s) => s.id);
  cards.push({ code: c.code, visits });
}
assert.equal(new Set(cards.map((c) => c.code)).size, N, "codes are unique");

const t0 = Date.now();
const jobs = cards.flatMap((c) =>
  c.visits.flatMap((stall) => [0, 1].map(() => () => call("POST", "/api/station/stamp", { code: c.code }, { "x-key": pins[stall] }))),
);
// 40 requests in flight at a time, roughly what a busy hall sends
await Promise.all(
  Array.from({ length: 40 }, async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) await j();
  }),
);
console.log(`stamped ${cards.reduce((n, c) => n + c.visits.length, 0)} visits (x2 duplicates) in ${Date.now() - t0}ms`);

for (const c of cards) {
  const v = (await call("GET", `/api/cards/${c.code}`)).body;
  assert.equal(v.stamps.length, c.visits.length, "duplicate scans count once");
  assert.equal(v.complete, c.visits.length >= need);
}

// Donut rules
const full = cards.filter((c) => c.visits.length >= need);
const short = cards.find((c) => c.visits.length < need)!;
const stallPin = pins[cfg.stalls[0].id];
assert.equal((await call("POST", "/api/station/redeem", { code: full[0].code }, { "x-key": stallPin })).status, 403, "a stall cannot hand out donuts");
assert.equal((await call("POST", "/api/station/stamp", { code: full[0].code }, { "x-key": donutPin })).status, 403, "donut corner cannot stamp");
assert.equal((await call("POST", "/api/station/redeem", { code: short.code }, { "x-key": donutPin })).body.result, "incomplete");
assert.equal((await call("POST", "/api/station/stamp", { code: "ZZZZZZZZ" }, { "x-key": stallPin })).status, 404);
assert.equal((await call("POST", "/api/station/stamp", { code: short.code }, { "x-key": "0000" })).status, 401);
assert.equal((await call("POST", "/api/station/stamp", { code: short.code }, { "x-key": "A".repeat(16) })).status, 401);
assert.equal((await call("POST", "/api/station/stamp", { code: short.code })).status, 401, "no key, no stamp");
assert.equal((await call("POST", "/api/station/stamp", { code: "' OR 1=1 --" }, { "x-key": stallPin })).status, 404, "junk codes are rejected");
assert.equal((await call("GET", "/api/qr/NOTACODE.svg")).status, 404);
assert.equal((await call("GET", "/api/entry-qr.svg")).status, 200);
assert.equal((await call("GET", `/api/admin/stations/${cfg.stalls[0].id}/qr.svg`)).status, 401, "login QR is admin only");
assert.match((await call("GET", `/api/admin/stations/${cfg.stalls[0].id}/qr.svg`, undefined, admin)).body as string, /<svg/);
assert.equal((await call("POST", "/api/cards", { nickname: "<img src=x onerror=alert(1)>" })).body.nickname, "img src=x onerror=alert(1)", "angle brackets stripped from nicknames");
assert.equal((await call("GET", "/api/admin/stats")).status, 401);

const race = await Promise.all([0, 1, 2, 3].map(() => call("POST", "/api/station/redeem", { code: full[0].code }, { "x-key": donutPin })));
assert.equal(race.filter((r) => r.body.result === "redeemed").length, 1, "four racing volunteers hand out one donut");

for (const c of full.slice(1, 100)) assert.equal((await call("POST", "/api/station/redeem", { code: c.code }, { "x-key": donutPin })).body.result, "redeemed");
await call("POST", "/api/admin/donuts-out", { out: true }, admin);
assert.equal((await call("POST", "/api/station/redeem", { code: full[100].code }, { "x-key": donutPin })).body.result, "out");
assert.equal((await call("GET", `/api/cards/${full[100].code}`)).body.donutsOut, true);
await call("POST", "/api/admin/donuts-out", { out: false }, admin);

// Undo and manual override
await call("POST", "/api/station/undo", { code: full[101].code }, { "x-key": pins[full[101].visits[0]] });
assert.equal((await call("GET", `/api/cards/${full[101].code}`)).body.complete, false);
await call("POST", "/api/admin/stamp", { code: full[101].code, stallId: full[101].visits[0] }, admin);
assert.equal((await call("GET", `/api/cards/${full[101].code}`)).body.complete, true);
await call("POST", "/api/station/unredeem", { code: full[1].code }, { "x-key": donutPin });
assert.equal((await call("POST", "/api/station/redeem", { code: full[1].code }, { "x-key": donutPin })).body.result, "redeemed");

// New key: the old one stops working, the new one works
const rotated = (await call("POST", `/api/admin/stations/${cfg.stalls[1].id}/rotate`, undefined, admin)).body.secret;
assert.equal((await call("GET", "/api/station/me", undefined, { "x-key": pins[cfg.stalls[1].id] })).status, 401, "old key dies");
assert.equal((await call("GET", "/api/station/me", undefined, { "x-key": rotated })).body.id, cfg.stalls[1].id);

assert.equal((await call("POST", "/api/admin/reset", { confirm: "nope" }, admin)).status, 400, "wrong reset phrase is refused");

// Repair mission: server owns progress and Hall registration requires completion.
{
  const { BUG_STALL, HEARTS, isCorrect, sceneIndex } = await import("../src/bughunt.js");
  const fresh = (await call("POST", "/api/cards", { nickname: "hunter" })).body.code as string;
  assert.equal((await call("GET", `/api/cards/${fresh}/bug-hunt`)).status, 403, "no Tech stamp, no mission");
  await call("POST", "/api/station/stamp", { code: fresh }, { "x-key": pins[BUG_STALL] });
  assert.equal((await call("POST", `/api/cards/${fresh}/squash`, { name: "too early" })).status, 403, "cannot skip mission");
  const attendee = (await pool.query("select id from attendees where code=$1", [fresh])).rows[0];
  const seed = (await pool.query("select seed from bug_missions where attendee_id=$1", [attendee.id])).rows[0].seed as number;
  for (let stage = 0; stage < 5; stage++) {
    const before = (await call("GET", `/api/cards/${fresh}/bug-hunt`)).body;
    assert.equal(before.progress, stage, "reload resumes at current step");
    if (stage === 0) {
      const wrong = before.options.findIndex((_: unknown, i: number) => !isCorrect(seed, stage, i));
      const failed = (await call("POST", `/api/cards/${fresh}/bug-hunt/actions`, { stage, choice: wrong })).body;
      assert.equal(failed.progress, stage, "wrong answer does not advance");
      assert.equal(failed.hearts, HEARTS - 1, "wrong answer costs a heart");
      await call("POST", `/api/cards/${fresh}/bug-hunt/actions`, { stage, choice: wrong });
      assert.ok((await call("GET", `/api/cards/${fresh}/bug-hunt`)).body.hint, "hint after two misses");
    }
    const right = before.options.findIndex((_: unknown, i: number) => isCorrect(seed, stage, i));
    const passed = (await call("POST", `/api/cards/${fresh}/bug-hunt/actions`, { stage, choice: right })).body;
    assert.equal(passed.progress, stage + 1);
    assert.equal(passed.hearts, HEARTS - 2, "correct answers keep earlier heart losses visible");
    assert.equal((await call("POST", `/api/cards/${fresh}/bug-hunt/actions`, { stage, choice: right })).body.progress, stage + 1, "duplicate action is safe");
  }
  assert.equal((await call("GET", `/api/cards/${fresh}/bug-hunt`)).body.stage, "complete");
  const first = (await call("POST", `/api/cards/${fresh}/squash`, { name: "<b>Ada</b>" })).body;
  assert.equal(first.rank, 1);
  assert.equal(first.hearts, HEARTS - 2, "hall records hearts left");
  assert.ok(Number.isInteger(first.seconds) && first.seconds >= 1, "hall records time taken");
  assert.equal(first.name, "bAda/b", "angle brackets stripped");
  assert.equal((await call("POST", `/api/cards/${fresh}/squash`, { name: "again" })).body.rank, 1, "solving twice keeps rank");
  const second = (await call("POST", "/api/cards", {})).body.code as string;
  await call("POST", "/api/station/stamp", { code: second }, { "x-key": pins[BUG_STALL] });
  const oldId = (await pool.query("select id from attendees where code=$1", [second])).rows[0].id;
  await pool.query("insert into squashers (attendee_id, name) values ($1,$2)", [oldId, "Anonymous squasher"]);
  assert.equal((await call("GET", `/api/cards/${second}/bug-hunt`)).body.stage, "complete", "old Hall entries stay valid");
  assert.equal((await call("POST", `/api/cards/${second}/squash`, {})).body.rank, 2);
  const hall = (await call("GET", "/api/hall")).body;
  assert.deepEqual(hall.map((h: any) => h.name), ["bAda/b", "Anonymous squasher"]);
  assert.equal(hall[0].hearts, HEARTS - 2);
  assert.equal(hall[1].seconds, null, "old entries without timing still list");

  // Out of hearts: the lab reboots with a different bug, full hearts, back to step 1.
  const third = (await call("POST", "/api/cards", {})).body.code as string;
  await call("POST", "/api/station/stamp", { code: third }, { "x-key": pins[BUG_STALL] });
  const start = (await call("GET", `/api/cards/${third}/bug-hunt`)).body;
  const thirdId = (await pool.query("select id from attendees where code=$1", [third])).rows[0].id;
  const seed3 = (await pool.query("select seed from bug_missions where attendee_id=$1", [thirdId])).rows[0].seed as number;
  const wrong3 = start.options.findIndex((_: unknown, i: number) => !isCorrect(seed3, 0, i));
  let last: any;
  for (let i = 0; i < HEARTS; i++) last = (await call("POST", `/api/cards/${third}/bug-hunt/actions`, { stage: 0, choice: wrong3 })).body;
  assert.equal(last.feedback, "reboot", "losing the last heart reboots");
  assert.equal(last.hearts, HEARTS, "hearts refilled after reboot");
  assert.equal(last.progress, 0);
  const seedAfter = (await pool.query("select seed, reboots from bug_missions where attendee_id=$1", [thirdId])).rows[0];
  assert.notEqual(sceneIndex(seedAfter.seed), sceneIndex(seed3), "reboot picks a different bug");
  assert.equal(seedAfter.reboots, 1);
  assert.notEqual(last.title, start.title);
}

// Live databases created before hearts existed get the new columns, keeping their rows.
{
  const { migrate } = await import("../src/db.js");
  const oldPool = await makePool();
  await oldPool.query("create table bug_missions (attendee_id int primary key, seed int not null, stage int not null default 0, attempts int not null default 0, completed_at timestamptz)");
  await oldPool.query("create table squashers (attendee_id int primary key, name text not null, solved_at timestamptz default now())");
  await oldPool.query("insert into bug_missions (attendee_id, seed, stage) values (1, 42, 2)");
  await migrate(oldPool);
  await migrate(oldPool); // running twice is harmless
  const row = (await oldPool.query("select * from bug_missions")).rows[0];
  assert.equal(row.stage, 2, "existing progress kept");
  assert.equal(row.mistakes, 0);
  const sqCols = (await oldPool.query("select column_name from information_schema.columns where table_name = 'squashers'")).rows.map((r: any) => r.column_name);
  assert.ok(sqCols.includes("seconds") && sqCols.includes("hearts"));
}

// Admin Fix a card: donut and bug hunt by hand
{
  const card = (await call("POST", "/api/cards", { nickname: "fixme" })).body.code as string;
  assert.equal((await call("POST", "/api/admin/donut", { code: card, on: true })).status, 401, "admin only");
  assert.equal((await call("POST", "/api/admin/donut", { code: card, on: true }, admin)).body.donutClaimed, true);
  assert.equal((await call("POST", "/api/admin/donut", { code: card, on: false }, admin)).body.donutClaimed, false);
  const marked = (await call("POST", "/api/admin/bug", { code: card, on: true }, admin)).body;
  assert.equal(marked.bugSquashed, true);
  assert.equal((await call("GET", `/api/cards/${card}/bug-hunt`)).status, 403, "card page still needs the Tech stamp to show the hunt");
  assert.ok((await call("GET", "/api/hall")).body.some((h: any) => h.name === "fixme"), "marked card joins the hall under its nickname");
  const unmarked = (await call("POST", "/api/admin/bug", { code: card, on: false }, admin)).body;
  assert.equal(unmarked.bugSquashed, false);
  assert.ok(!(await call("GET", "/api/hall")).body.some((h: any) => h.name === "fixme"), "removed from the hall");
}

const end = (await call("GET", "/api/admin/stats", undefined, admin)).body;
assert.equal(end.attendees, N + 5);
assert.equal(end.completed, full.length);
assert.equal(end.donutsGiven, 100);
const csv = (await call("GET", "/api/admin/export.csv", undefined, admin)).body as string;
assert.equal(csv.trim().split("\n").length, N + 6);

// Restart with a stall removed from the config: its key dies and its stamps stop counting, keys of other stations survive
const dropped = cfg.stalls[cfg.stalls.length - 1];
const smaller = { ...cfg, stalls: cfg.stalls.slice(0, -1), reward: { ...cfg.reward, stampsRequired: cfg.stalls.length - 1 } };
const app2 = await createApp(pool, smaller, "admin");
const server2 = app2.listen(0);
const base2 = `http://localhost:${(server2.address() as AddressInfo).port}`;
const r2 = await fetch(`${base2}/api/station/me`, { headers: { "x-key": pins[dropped.id] } });
assert.equal(r2.status, 401, "removed stall's key stops working");
const r3 = await fetch(`${base2}/api/station/me`, { headers: { "x-key": pins[cfg.stalls[0].id] } });
assert.equal(r3.status, 200, "other keys survive a restart");
const onlyDropped = cards.find((c) => c.visits.length === 1 && c.visits[0] === dropped.id);
if (onlyDropped) assert.equal((await (await fetch(`${base2}/api/cards/${onlyDropped.code}`)).json()).stamps.length, 0, "stamps from removed stalls don't count");
server2.close();

// Configs that can never complete are refused at boot
assert.throws(() => validateConfig({ ...cfg, reward: { ...cfg.reward, stampsRequired: cfg.stalls.length + 1 } }));
assert.throws(() => validateConfig({ ...cfg, stalls: [...cfg.stalls, cfg.stalls[0]] }));

console.log(`ok: ${N} attendees, ${end.stamps} stamps, ${end.completed} completed, ${end.donutsGiven} donuts`);
server.close();
process.exit(0);
