import express, { type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";
import QRCode from "qrcode";
import crypto from "node:crypto";
import path from "node:path";
import type { EventConfig } from "./config.js";
import { migrate } from "./db.js";
import { CODE_RE, KEY_RE, randomCode } from "./codes.js";
import { checkName } from "./names.js";
import { BUG_STALL, HEARTS, MISSION_DONE, isCorrect, missionView, sceneIndex } from "./bughunt.js";

const cleanCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Station keys are 16 characters (about 75 bits), so guessing one over the network is hopeless and no rate limit is needed.
const newSecret = () => randomCode(16);

type Station = { id: string; name: string; kind: "stall" | "donut"; secret: string; sort: number };
type Attendee = { id: number; code: string; nickname: string | null; donut_claimed_at: Date | null };
type StampRow = { attendee_id: number; stall_id: string; swag_given: boolean };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const sameSecret = (a: string, b: string) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());

// resetPhrase comes from the RESET_PHRASE env var, so it never sits in the repo or the page source.
export async function createApp(pool: Pool, cfg: EventConfig, adminPin: string, resetPhrase = "RESET") {
  await migrate(pool);
  const stallIds = new Set(cfg.stalls.map((s) => s.id));

  // Stations mirror the config file. Keys of existing stations survive restarts, so the briefing stays valid.
  // Stations no longer in the config are deleted, so their keys stop working.
  const wanted = [
    ...cfg.stalls.map((s, i) => ({ id: s.id, name: s.name, kind: "stall", sort: i })),
    { id: cfg.reward.station.id, name: cfg.reward.station.name, kind: "donut", sort: 99 },
  ];
  for (const { id } of (await pool.query("select id from stations")).rows)
    if (!wanted.some((w) => w.id === id)) await pool.query("delete from stations where id=$1", [id]);
  for (const s of wanted)
    await pool.query(
      `insert into stations (id, name, kind, secret, sort) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set name = excluded.name, kind = excluded.kind, sort = excluded.sort`,
      [s.id, s.name, s.kind, newSecret(), s.sort],
    );

  const getSetting = async (key: string) =>
    (await pool.query("select value from settings where key=$1", [key])).rows[0]?.value as string | undefined;
  const setSetting = (key: string, value: string) =>
    pool.query(
      "insert into settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value",
      [key, value],
    );

  const findAttendee = async (raw: unknown): Promise<Attendee> => {
    const code = cleanCode(raw);
    const r = CODE_RE.test(code) ? await pool.query("select * from attendees where code=$1", [code]) : { rows: [] };
    if (!r.rows[0]) throw new HttpError(404, "No card with that code");
    return r.rows[0];
  };

  // Only stamps from stalls in the current config count.
  const stampsOf = async (attendeeId: number) =>
    ((await pool.query("select * from stamps where attendee_id=$1", [attendeeId])).rows as StampRow[]).filter((s) =>
      stallIds.has(s.stall_id),
    );

  const cardView = async (a: Attendee) => {
    const stamps = await stampsOf(a.id);
    return {
      code: a.code,
      nickname: a.nickname,
      stamps: stamps.map((s) => s.stall_id),
      stampsRequired: cfg.reward.stampsRequired,
      complete: stamps.length >= cfg.reward.stampsRequired,
      donutClaimed: !!a.donut_claimed_at,
      donutsOut: (await getSetting("donuts_out")) === "1",
    };
  };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render terminates TLS in front of us, so req.protocol is https there
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(path.resolve("public")));
  app.get("/staff-only", (_req, res) => res.sendFile("index.html", { root: path.resolve("public") }));
  app.get("/vendor/jsqr.js", (_req, res) => res.sendFile(path.resolve("node_modules/jsqr/dist/jsQR.js")));

  const baseUrl = (req: Request) => process.env.PUBLIC_URL?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`;
  const svg = async (res: Response, text: string) =>
    res.type("image/svg+xml").send(await QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));

  // ---- public: attendee ----
  app.get("/api/config", wrap(async (_req, res) => {
    res.json({ name: cfg.name, date: cfg.date, time: cfg.time, venue: cfg.venue, stalls: cfg.stalls, reward: cfg.reward, links: cfg.links,
      donutsOut: (await getSetting("donuts_out")) === "1" });
  }));

  app.post(
    "/api/cards",
    wrap(async (req, res) => {
      const checked = checkName(req.body?.nickname, 30);
      if (!checked.ok) throw new HttpError(400, `Nickname: ${checked.reason}`);
      const nickname = checked.name;
      for (let i = 0; i < 5; i++) {
        const r = await pool.query(
          "insert into attendees (code, nickname) values ($1,$2) on conflict (code) do nothing returning *",
          [randomCode(8), nickname],
        );
        if (r.rows[0]) return res.status(201).json(await cardView(r.rows[0]));
      }
      throw new HttpError(500, "Could not make a code, try again");
    }),
  );

  const missionFor = async (a: Attendee, start = false) => {
    if (!(await stampsOf(a.id)).some((s) => s.stall_id === BUG_STALL)) throw new HttpError(403, "Visit the Tech Cell stall first");
    await pool.query("insert into bug_missions (attendee_id, seed, started_at) values ($1,$2,null) on conflict (attendee_id) do nothing", [a.id, crypto.randomInt(0, 2147483647)]);
    if (start) await pool.query("update bug_missions set started_at=now() where attendee_id=$1 and started_at is null", [a.id]);
    const mission = (await pool.query("select seed, stage, attempts, mistakes, started_at from bug_missions where attendee_id=$1", [a.id])).rows[0] as { seed: number; stage: number; attempts: number; mistakes: number; started_at: Date | null };
    const ranked = (await pool.query("select attendee_id from squashers where attendee_id=$1", [a.id])).rows.length > 0;
    // Seconds on the mission clock so far, for the live timer on the card (the page counts up from here).
    const elapsed = mission.started_at ? Math.max(0, Math.round((Date.now() - new Date(mission.started_at).getTime()) / 1000)) : 0;
    return { mission, ranked, elapsed };
  };

  app.get("/api/cards/:code/bug-hunt", wrap(async (req, res) => {
    const a = await findAttendee(req.params.code);
    const { mission, ranked, elapsed } = await missionFor(a, req.query.start === "1");
    res.json({ ...missionView(mission.seed, mission.stage, mission.attempts, ranked, mission.mistakes), elapsed });
  }));

  app.post("/api/cards/:code/bug-hunt/actions", wrap(async (req, res) => {
    const a = await findAttendee(req.params.code);
    const { mission, ranked, elapsed } = await missionFor(a, true);
    const send = (body: object) => res.json({ ...body, elapsed });
    if (ranked || mission.stage >= MISSION_DONE) return send(missionView(mission.seed, MISSION_DONE, 0, true, mission.mistakes));
    const stage = req.body?.stage, choice = req.body?.choice;
    if (!Number.isInteger(stage) || !Number.isInteger(choice) || stage < 0 || choice < 0) throw new HttpError(400, "Choose a mission answer");
    if (stage !== mission.stage) return send({ ...missionView(mission.seed, mission.stage, mission.attempts, false, mission.mistakes), feedback: "Already moved on. Here's your current step." });
    const correct = isCorrect(mission.seed, stage, choice);
    const updated = (await pool.query(correct
      ? "update bug_missions set stage=stage+1, attempts=0 where attendee_id=$1 and stage=$2 returning seed, stage, attempts, mistakes"
      : "update bug_missions set attempts=attempts+1, mistakes=mistakes+1 where attendee_id=$1 and stage=$2 returning seed, stage, attempts, mistakes", [a.id, stage])).rows[0] as { seed: number; stage: number; attempts: number; mistakes: number } | undefined;
    // Out of hearts: reboot the lab with a different bug. The clock keeps running.
    if (updated && !correct && updated.mistakes >= HEARTS) {
      let seed = crypto.randomInt(0, 2147483647);
      while (sceneIndex(seed) === sceneIndex(updated.seed)) seed = crypto.randomInt(0, 2147483647);
      await pool.query("update bug_missions set seed=$2, stage=0, attempts=0, mistakes=0, reboots=reboots+1 where attendee_id=$1", [a.id, seed]);
      return send({ ...missionView(seed, 0, 0, false, 0), feedback: "reboot" });
    }
    if (updated?.stage === MISSION_DONE) await pool.query("update bug_missions set completed_at=now() where attendee_id=$1 and completed_at is null", [a.id]);
    const current = updated || (await missionFor(a)).mission;
    const mistakes = (updated as { mistakes?: number } | undefined)?.mistakes ?? (current as { mistakes?: number }).mistakes ?? 0;
    send({ ...missionView(current.seed, current.stage, current.attempts, false, mistakes), feedback: updated ? correct ? "pass" : "Wrong. You lost a heart." : "Already moved on. Here's your current step." });
  }));

  // Existing Hall entries keep their rank; new entries require server-recorded mission completion.
  app.post(
    "/api/cards/:code/squash",
    wrap(async (req, res) => {
      const a = await findAttendee(req.params.code);
      const { mission, ranked } = await missionFor(a);
      if (!ranked && mission.stage < MISSION_DONE) throw new HttpError(403, "Finish the bug hunt first");
      const checked = checkName(req.body?.name, 24);
      if (!checked.ok) throw new HttpError(400, checked.reason);
      const name = checked.name || "Anonymous squasher";
      const done = (await pool.query("select started_at, completed_at, mistakes from bug_missions where attendee_id=$1", [a.id])).rows[0] as
        { started_at: Date | null; completed_at: Date | null; mistakes: number } | undefined;
      const seconds = done?.started_at && done?.completed_at
        ? Math.max(1, Math.round((new Date(done.completed_at).getTime() - new Date(done.started_at).getTime()) / 1000)) : null;
      const hearts = done ? Math.max(0, HEARTS - done.mistakes) : null;
      await pool.query("insert into squashers (attendee_id, name, seconds, hearts) values ($1,$2,$3,$4) on conflict (attendee_id) do nothing", [a.id, name, seconds, hearts]);
      // A placeholder entry (say, marked squashed from admin) takes the name the attendee types later. Real names stay put.
      if (name !== "Anonymous squasher")
        await pool.query("update squashers set name=$2 where attendee_id=$1 and name='Anonymous squasher'", [a.id, name]);
      const all = (await pool.query("select attendee_id, name, solved_at, seconds, hearts from squashers order by solved_at, attendee_id")).rows as {
        attendee_id: number; name: string; solved_at: Date; seconds: number | null; hearts: number | null;
      }[];
      const i = all.findIndex((r) => r.attendee_id === a.id);
      res.json({ rank: i + 1, name: all[i].name, solvedAt: all[i].solved_at, seconds: all[i].seconds, hearts: all[i].hearts });
    }),
  );

  // Change your Hall of Fame name after solving (say you left it blank). Same name filter; keeps your rank.
  app.post(
    "/api/cards/:code/rename",
    wrap(async (req, res) => {
      const a = await findAttendee(req.params.code);
      const checked = checkName(req.body?.name, 24);
      if (!checked.ok) throw new HttpError(400, checked.reason);
      const updated = await pool.query("update squashers set name=$2 where attendee_id=$1 returning attendee_id", [a.id, checked.name || "Anonymous squasher"]);
      if (!updated.rows[0]) throw new HttpError(403, "Finish the bug hunt first");
      const all = (await pool.query("select attendee_id, name, solved_at, seconds, hearts from squashers order by solved_at, attendee_id")).rows as {
        attendee_id: number; name: string; solved_at: Date; seconds: number | null; hearts: number | null;
      }[];
      const i = all.findIndex((r) => r.attendee_id === a.id);
      res.json({ rank: i + 1, name: all[i].name, solvedAt: all[i].solved_at, seconds: all[i].seconds, hearts: all[i].hearts });
    }),
  );

  // Public list for the big screen at the stall: names, ranks, time taken and hearts left.
  app.get(
    "/api/hall",
    wrap(async (_req, res) => {
      const rows = (await pool.query("select name, solved_at, seconds, hearts from squashers order by solved_at, attendee_id")).rows as {
        name: string; solved_at: Date; seconds: number | null; hearts: number | null;
      }[];
      res.json(rows.slice(0, 100).map((r, i) => ({ rank: i + 1, name: r.name, solvedAt: r.solved_at, seconds: r.seconds, hearts: r.hearts })));
    }),
  );

  // Second Hall of Fame board: first to collect their donut. Nickname only (or "Anonymous"), in collection order.
  app.get(
    "/api/hall/donuts",
    wrap(async (_req, res) => {
      const rows = (await pool.query("select nickname, donut_claimed_at from attendees where donut_claimed_at is not null order by donut_claimed_at, id")).rows as {
        nickname: string | null; donut_claimed_at: Date;
      }[];
      res.json(rows.slice(0, 100).map((r, i) => ({ rank: i + 1, name: r.nickname || "Anonymous", collectedAt: r.donut_claimed_at })));
    }),
  );

  app.get(
    "/api/cards/:code",
    wrap(async (req, res) => res.json(await cardView(await findAttendee(req.params.code)))),
  );

  app.get(
    "/api/qr/:code.svg",
    wrap(async (req, res) => {
      const code = cleanCode(req.params.code);
      if (!CODE_RE.test(code)) throw new HttpError(404, "Not a card code");
      await svg(res, code);
    }),
  );

  // Door poster: a QR of this site's own address.
  app.get(
    "/api/entry-qr.svg",
    wrap(async (req, res) => svg(res, baseUrl(req) + "/")),
  );

  // ---- stations (volunteers) ----
  const stationFor = async (req: Request): Promise<Station> => {
    const secret = cleanCode(req.header("x-key"));
    const r = KEY_RE.test(secret) ? await pool.query("select * from stations where secret=$1", [secret]) : { rows: [] };
    if (!r.rows[0]) throw new HttpError(401, "That station key doesn't work. Ask the Tech Lead for a new one.");
    return r.rows[0];
  };
  const asStation = (kind: Station["kind"], fn: (req: Request, res: Response, st: Station) => Promise<unknown>) =>
    wrap(async (req, res) => {
      const st = await stationFor(req);
      if (st.kind !== kind)
        throw new HttpError(403, kind === "stall" ? "This is the donut corner login. It can't stamp." : "Only the donut corner can do that");
      return fn(req, res, st);
    });

  app.get(
    "/api/station/me",
    wrap(async (req, res) => {
      const st = await stationFor(req);
      const look = [...cfg.stalls, cfg.reward.station].find((s) => s.id === st.id);
      res.json({ id: st.id, name: st.name, kind: st.kind, icon: look?.icon, color: look?.color });
    }),
  );

  app.post(
    "/api/station/stamp",
    asStation("stall", async (req, res, st) => {
      const a = await findAttendee(req.body?.code);
      const r = await pool.query(
        "insert into stamps (attendee_id, stall_id) values ($1,$2) on conflict (attendee_id, stall_id) do nothing returning stall_id",
        [a.id, st.id],
      );
      const mine = (await stampsOf(a.id)).find((s) => s.stall_id === st.id);
      const card = await cardView(a);
      res.json({ ...card, result: r.rows[0] ? "stamped" : "already", count: card.stamps.length, swagGiven: !!mine?.swag_given });
    }),
  );

  app.post(
    "/api/station/swag",
    asStation("stall", async (req, res, st) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("update stamps set swag_given=$3 where attendee_id=$1 and stall_id=$2", [a.id, st.id, !!req.body?.given]);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/station/undo",
    asStation("stall", async (req, res, st) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("delete from stamps where attendee_id=$1 and stall_id=$2", [a.id, st.id]);
      res.json(await cardView(a));
    }),
  );

  app.post(
    "/api/station/redeem",
    asStation("donut", async (req, res) => {
      const a = await findAttendee(req.body?.code);
      const card = await cardView(a);
      if (card.donutClaimed) return res.json({ ...card, result: "already" });
      if (!card.complete) return res.json({ ...card, result: "incomplete", count: card.stamps.length });
      if (card.donutsOut) return res.json({ ...card, result: "out" });
      // The where clause makes two volunteers racing on one card hand out one donut.
      const r = await pool.query(
        "update attendees set donut_claimed_at=now() where id=$1 and donut_claimed_at is null returning id",
        [a.id],
      );
      const after = await cardView(a);
      res.json({ ...after, result: r.rows[0] ? "redeemed" : "already", count: after.stamps.length });
    }),
  );

  app.post(
    "/api/station/unredeem",
    asStation("donut", async (req, res) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("update attendees set donut_claimed_at=null where id=$1", [a.id]);
      res.json(await cardView(a));
    }),
  );

  // ---- admin ----
  const adminAuth = (req: Request, _res: Response, next: NextFunction) =>
    next(sameSecret(String(req.header("x-admin-pin") ?? ""), adminPin) ? undefined : new HttpError(401, "Wrong admin PIN"));

  app.get(
    "/api/admin/stats",
    adminAuth,
    wrap(async (_req, res) => {
      const stations = (await pool.query("select * from stations order by sort")).rows as Station[];
      const stamps = ((await pool.query("select * from stamps")).rows as StampRow[]).filter((s) => stallIds.has(s.stall_id));
      const attendees = (await pool.query("select id, donut_claimed_at from attendees")).rows as Attendee[];
      const perAttendee = new Map<number, number>();
      for (const s of stamps) perAttendee.set(s.attendee_id, (perAttendee.get(s.attendee_id) ?? 0) + 1);
      res.json({
        attendees: attendees.length,
        completed: [...perAttendee.values()].filter((n) => n >= cfg.reward.stampsRequired).length,
        donutsGiven: attendees.filter((a) => a.donut_claimed_at).length,
        donutsOut: (await getSetting("donuts_out")) === "1",
        stamps: stamps.length,
        stations: stations.map((st) => ({
          id: st.id,
          name: st.name,
          kind: st.kind,
          secret: st.secret,
          stamps: stamps.filter((s) => s.stall_id === st.id).length,
          swagGiven: stamps.filter((s) => s.stall_id === st.id && s.swag_given).length,
        })),
      });
    }),
  );

  const stationById = async (id: unknown) => {
    const r = await pool.query("select * from stations where id=$1", [String(id)]);
    if (!r.rows[0]) throw new HttpError(404, "No such station");
    return r.rows[0] as Station;
  };

  // Login QR for a volunteer phone. The key sits in the #fragment, which browsers never send to the server or in Referer.
  app.get(
    "/api/admin/stations/:id/qr.svg",
    adminAuth,
    wrap(async (req, res) => svg(res, `${baseUrl(req)}/stall.html#k=${(await stationById(req.params.id)).secret}`)),
  );

  // Lost phone or leaked key: issue a new one. The old key stops working at once.
  app.post(
    "/api/admin/stations/:id/rotate",
    adminAuth,
    wrap(async (req, res) => {
      const st = await stationById(req.params.id);
      const secret = newSecret();
      await pool.query("update stations set secret=$2 where id=$1", [st.id, secret]);
      res.json({ id: st.id, secret });
    }),
  );

  app.post(
    "/api/admin/donuts-out",
    adminAuth,
    wrap(async (req, res) => {
      await setSetting("donuts_out", req.body?.out ? "1" : "0");
      res.json({ donutsOut: !!req.body?.out });
    }),
  );

  app.post(
    "/api/admin/stamp",
    adminAuth,
    wrap(async (req, res) => {
      const a = await findAttendee(req.body?.code);
      const stallId = String(req.body?.stallId);
      if (!stallIds.has(stallId)) throw new HttpError(400, "Unknown stall");
      if (req.body?.on === false) await pool.query("delete from stamps where attendee_id=$1 and stall_id=$2", [a.id, stallId]);
      else
        await pool.query(
          "insert into stamps (attendee_id, stall_id) values ($1,$2) on conflict (attendee_id, stall_id) do nothing",
          [a.id, stallId],
        );
      res.json(await cardView(a));
    }),
  );

  // Manual fixes from the admin "Fix a card" box: mark or undo the donut, mark or undo the bug hunt.
  const adminCardView = async (a: Attendee) => ({
    ...(await cardView(a)),
    bugSquashed: (await pool.query("select 1 from squashers where attendee_id=$1", [a.id])).rows.length > 0,
  });

  // Every name currently on either Hall of Fame board, with the card code, for moderation.
  app.get(
    "/api/admin/hall-names",
    adminAuth,
    wrap(async (_req, res) => {
      const donuts = (await pool.query("select code, nickname from attendees where donut_claimed_at is not null and nickname is not null order by donut_claimed_at")).rows as { code: string; nickname: string }[];
      const bugs = (await pool.query("select a.code, s.name from squashers s join attendees a on a.id = s.attendee_id where s.name <> 'Anonymous squasher' order by s.solved_at")).rows as { code: string; name: string }[];
      res.json([
        ...donuts.map((r) => ({ code: r.code, name: r.nickname, board: "donut" })),
        ...bugs.map((r) => ({ code: r.code, name: r.name, board: "bug" })),
      ]);
    }),
  );

  // Backstop for names the filter missed: blank the nickname (donut board shows Anonymous) and the squasher name.
  app.post(
    "/api/admin/hide-name",
    adminAuth,
    wrap(async (req, res) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("update attendees set nickname=null where id=$1", [a.id]);
      await pool.query("update squashers set name='Anonymous squasher' where attendee_id=$1", [a.id]);
      res.json(await adminCardView(await findAttendee(a.code)));
    }),
  );

  app.post(
    "/api/admin/donut",
    adminAuth,
    wrap(async (req, res) => {
      const a = await findAttendee(req.body?.code);
      if (req.body?.on === false) await pool.query("update attendees set donut_claimed_at=null where id=$1", [a.id]);
      else await pool.query("update attendees set donut_claimed_at=now() where id=$1 and donut_claimed_at is null", [a.id]);
      res.json(await adminCardView((await findAttendee(a.code))));
    }),
  );

  app.post(
    "/api/admin/bug",
    adminAuth,
    wrap(async (req, res) => {
      const a = await findAttendee(req.body?.code);
      if (req.body?.on === false) {
        await pool.query("delete from squashers where attendee_id=$1", [a.id]);
        await pool.query("delete from bug_missions where attendee_id=$1", [a.id]);
      } else {
        await pool.query("insert into bug_missions (attendee_id, seed) values ($1,$2) on conflict (attendee_id) do nothing", [a.id, crypto.randomInt(0, 2147483647)]);
        await pool.query("update bug_missions set stage=$2, completed_at=coalesce(completed_at, now()) where attendee_id=$1", [a.id, MISSION_DONE]);
        await pool.query("insert into squashers (attendee_id, name) values ($1,$2) on conflict (attendee_id) do nothing", [a.id, a.nickname || "Anonymous squasher"]);
      }
      res.json(await adminCardView(a));
    }),
  );

  app.post(
    "/api/admin/unredeem",
    adminAuth,
    wrap(async (req, res) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("update attendees set donut_claimed_at=null where id=$1", [a.id]);
      res.json(await cardView(a));
    }),
  );

  // Event analytics for the team report: totals and timings only. No card codes and no nicknames,
  // except the top 3 Hall of Fame names, which were already shown publicly.
  app.get(
    "/api/admin/analytics",
    adminAuth,
    wrap(async (_req, res) => {
      const attendees = (await pool.query("select id, created_at, donut_claimed_at from attendees")).rows as { id: number; created_at: Date; donut_claimed_at: Date | null }[];
      const stamps = ((await pool.query("select attendee_id, stall_id, swag_given, created_at from stamps")).rows as (StampRow & { created_at: Date })[])
        .filter((s) => stallIds.has(s.stall_id));
      const missions = (await pool.query("select stage, started_at, completed_at, mistakes, reboots from bug_missions")).rows as
        { stage: number; started_at: Date | null; completed_at: Date | null; mistakes: number; reboots: number }[];
      const squashers = (await pool.query("select name, seconds, hearts, solved_at from squashers order by solved_at, attendee_id")).rows as
        { name: string; seconds: number | null; hearts: number | null; solved_at: Date }[];
      const donutsHall = (await pool.query("select nickname from attendees where donut_claimed_at is not null order by donut_claimed_at, id")).rows as { nickname: string | null }[];

      // 15-minute buckets in Singapore time (UTC+8), as "HH:MM".
      const bucket = (d: Date) => {
        const t = new Date(new Date(d).getTime() + 8 * 3600 * 1000);
        return `${String(t.getUTCHours()).padStart(2, "0")}:${String(Math.floor(t.getUTCMinutes() / 15) * 15).padStart(2, "0")}`;
      };
      const countBy = <T>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => { const k = key(x); m[k] = (m[k] || 0) + 1; return m; }, {});
      const perCard = new Map<number, number>();
      for (const s of stamps) perCard.set(s.attendee_id, (perCard.get(s.attendee_id) || 0) + 1);
      const need = cfg.reward.stampsRequired;
      const distribution = Array.from({ length: need + 1 }, (_, n) => attendees.filter((a) => (perCard.get(a.id) || 0) === n).length);
      const solvedTimes = squashers.map((s) => s.seconds).filter((x): x is number => Number.isInteger(x)).sort((a, b) => a - b);
      const median = (xs: number[]) => xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : Math.round((xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2)) : null;

      res.json({
        event: { name: cfg.name, date: cfg.date, time: cfg.time, venue: cfg.venue },
        generatedAt: new Date().toISOString(),
        totals: {
          cards: attendees.length,
          stamps: stamps.length,
          cardsWithAStamp: attendees.filter((a) => (perCard.get(a.id) || 0) > 0).length,
          fullCards: attendees.filter((a) => (perCard.get(a.id) || 0) >= need).length,
          donuts: attendees.filter((a) => a.donut_claimed_at).length,
          swagHandedOut: stamps.filter((s) => s.swag_given).length,
          averageStampsPerCard: attendees.length ? Math.round((stamps.length / attendees.length) * 10) / 10 : 0,
        },
        stampsNeeded: need,
        stampDistribution: distribution, // index = number of stamps on a card
        stalls: cfg.stalls.map((st) => ({
          id: st.id, name: st.name, color: st.color,
          stamps: stamps.filter((s) => s.stall_id === st.id).length,
          swag: stamps.filter((s) => s.stall_id === st.id && s.swag_given).length,
        })),
        timeline: {
          cards: countBy(attendees, (a) => bucket(a.created_at)),
          stamps: countBy(stamps, (s) => bucket(s.created_at)),
          donuts: countBy(attendees.filter((a) => a.donut_claimed_at), (a) => bucket(a.donut_claimed_at as Date)),
        },
        bugHunt: {
          opened: missions.filter((m) => m.started_at).length,
          solved: squashers.length,
          medianSeconds: median(solvedTimes),
          fastestSeconds: solvedTimes[0] ?? null,
          heartsLeft: countBy(squashers.filter((s) => Number.isInteger(s.hearts)), (s) => String(s.hearts)),
          reboots: missions.reduce((n, m) => n + (m.reboots || 0), 0),
          topSquashers: squashers.slice(0, 3).map((s) => ({ name: s.name, seconds: s.seconds, hearts: s.hearts })),
        },
        hallOfFame: { donutBoard: donutsHall.length, bugBoard: squashers.length, topDonuts: donutsHall.slice(0, 3).map((d) => d.nickname || "Anonymous") },
      });
    }),
  );

  app.get(
    "/api/admin/export.csv",
    adminAuth,
    wrap(async (_req, res) => {
      const attendees = (await pool.query("select * from attendees order by id")).rows as Attendee[];
      const stamps = (await pool.query("select attendee_id, stall_id from stamps")).rows as StampRow[];
      const head = ["code", "nickname", ...cfg.stalls.map((s) => s.id), "donut_claimed"];
      // Leading = + - @ tab or CR would make Excel run the cell as a formula.
      const esc = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""');
      const lines = attendees.map((a) => {
        const mine = new Set(stamps.filter((s) => s.attendee_id === a.id).map((s) => s.stall_id));
        return [a.code, a.nickname ?? "", ...cfg.stalls.map((s) => (mine.has(s.id) ? "1" : "0")), a.donut_claimed_at ? "1" : "0"]
          .map((v) => `"${esc(v)}"`)
          .join(",");
      });
      res.type("text/csv").send([head.join(","), ...lines].join("\n"));
    }),
  );

  app.post(
    "/api/admin/reset",
    adminAuth,
    wrap(async (req, res) => {
      if (!sameSecret(String(req.body?.confirm ?? ""), resetPhrase)) throw new HttpError(400, "Wrong reset phrase");
      await pool.query("delete from stamps");
      await pool.query("delete from squashers");
      await pool.query("delete from bug_missions");
      await pool.query("delete from attendees");
      await setSetting("donuts_out", "0");
      res.json({ ok: true });
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Server error, try again" });
  });

  return app;
}
