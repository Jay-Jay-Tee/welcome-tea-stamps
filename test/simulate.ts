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

const end = (await call("GET", "/api/admin/stats", undefined, admin)).body;
assert.equal(end.attendees, N + 1);
assert.equal(end.completed, full.length);
assert.equal(end.donutsGiven, 100);
const csv = (await call("GET", "/api/admin/export.csv", undefined, admin)).body as string;
assert.equal(csv.trim().split("\n").length, N + 2);

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
