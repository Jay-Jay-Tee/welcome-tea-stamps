import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { makePool } from "../src/db.js";

const cfg = loadConfig();
const app = await createApp(await makePool(), cfg, "admin");
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
const pins: Record<string, string> = Object.fromEntries(stats.stations.map((s: any) => [s.id, s.pin]));
const donutPin = pins[cfg.reward.station.id];
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
  c.visits.flatMap((stall) => [0, 1].map(() => () => call("POST", "/api/station/stamp", { code: c.code }, { "x-pin": pins[stall] }))),
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
assert.equal((await call("POST", "/api/station/redeem", { code: full[0].code }, { "x-pin": stallPin })).status, 403, "a stall cannot hand out donuts");
assert.equal((await call("POST", "/api/station/stamp", { code: full[0].code }, { "x-pin": donutPin })).status, 403, "donut corner cannot stamp");
assert.equal((await call("POST", "/api/station/redeem", { code: short.code }, { "x-pin": donutPin })).body.result, "incomplete");
assert.equal((await call("POST", "/api/station/stamp", { code: "ZZZZZZZZ" }, { "x-pin": stallPin })).status, 404);
assert.equal((await call("POST", "/api/station/stamp", { code: short.code }, { "x-pin": "0000" })).status, 401);
assert.equal((await call("GET", "/api/admin/stats")).status, 401);

const race = await Promise.all([0, 1, 2, 3].map(() => call("POST", "/api/station/redeem", { code: full[0].code }, { "x-pin": donutPin })));
assert.equal(race.filter((r) => r.body.result === "redeemed").length, 1, "four racing volunteers hand out one donut");

for (const c of full.slice(1, 100)) assert.equal((await call("POST", "/api/station/redeem", { code: c.code }, { "x-pin": donutPin })).body.result, "redeemed");
await call("POST", "/api/admin/donuts-out", { out: true }, admin);
assert.equal((await call("POST", "/api/station/redeem", { code: full[100].code }, { "x-pin": donutPin })).body.result, "out");
assert.equal((await call("GET", `/api/cards/${full[100].code}`)).body.donutsOut, true);
await call("POST", "/api/admin/donuts-out", { out: false }, admin);

// Undo and manual override
await call("POST", "/api/station/undo", { code: full[101].code }, { "x-pin": pins[full[101].visits[0]] });
assert.equal((await call("GET", `/api/cards/${full[101].code}`)).body.complete, false);
await call("POST", "/api/admin/stamp", { code: full[101].code, stallId: full[101].visits[0] }, admin);
assert.equal((await call("GET", `/api/cards/${full[101].code}`)).body.complete, true);
await call("POST", "/api/station/unredeem", { code: full[1].code }, { "x-pin": donutPin });
assert.equal((await call("POST", "/api/station/redeem", { code: full[1].code }, { "x-pin": donutPin })).body.result, "redeemed");

const end = (await call("GET", "/api/admin/stats", undefined, admin)).body;
assert.equal(end.attendees, N);
assert.equal(end.completed, full.length);
assert.equal(end.donutsGiven, 100);
const csv = (await call("GET", "/api/admin/export.csv", undefined, admin)).body as string;
assert.equal(csv.trim().split("\n").length, N + 1);

console.log(`ok: ${N} attendees, ${end.stamps} stamps, ${end.completed} completed, ${end.donutsGiven} donuts`);
server.close();
process.exit(0);
