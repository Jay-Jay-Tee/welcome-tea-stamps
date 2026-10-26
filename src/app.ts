import express, { type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";
import QRCode from "qrcode";
import crypto from "node:crypto";
import path from "node:path";
import type { EventConfig } from "./config.js";
import { migrate } from "./db.js";

// No 0/O/1/I/L so a code read off paper survives a bad squint.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
const newPin = () => String(crypto.randomInt(1000, 10000));
const cleanCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Station = { id: string; name: string; kind: "stall" | "donut"; pin: string; sort: number };
type Attendee = { id: number; code: string; nickname: string | null; donut_claimed_at: Date | null };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export async function createApp(pool: Pool, cfg: EventConfig, adminPin: string) {
  await migrate(pool);

  // Stations come from the config file. Existing PINs are kept so a restart never invalidates printed briefings.
  const wanted = [
    ...cfg.stalls.map((s, i) => ({ id: s.id, name: s.name, kind: "stall", sort: i })),
    { id: cfg.reward.station.id, name: cfg.reward.station.name, kind: "donut", sort: 99 },
  ];
  for (const s of wanted) {
    await pool.query(
      `insert into stations (id, name, kind, pin, sort) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set name = excluded.name, kind = excluded.kind, sort = excluded.sort`,
      [s.id, s.name, s.kind, newPin(), s.sort],
    );
  }

  const getSetting = async (key: string) =>
    (await pool.query("select value from settings where key=$1", [key])).rows[0]?.value as string | undefined;
  const setSetting = (key: string, value: string) =>
    pool.query(
      "insert into settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value",
      [key, value],
    );

  const findAttendee = async (code: string): Promise<Attendee> => {
    const r = await pool.query("select * from attendees where code=$1", [cleanCode(code)]);
    if (!r.rows[0]) throw new HttpError(404, "No card with that code");
    return r.rows[0];
  };

  const stampsOf = async (attendeeId: number) =>
    (await pool.query("select stall_id, swag_given from stamps where attendee_id=$1", [attendeeId])).rows as {
      stall_id: string;
      swag_given: boolean;
    }[];

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
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(path.resolve("public")));
  app.get("/vendor/jsqr.js", (_req, res) => res.sendFile(path.resolve("node_modules/jsqr/dist/jsQR.js")));

  // ---- public: attendee ----
  app.get(
    "/api/config",
    wrap(async (_req, res) => {
      res.json({
        name: cfg.name,
        date: cfg.date,
        time: cfg.time,
        venue: cfg.venue,
        stalls: cfg.stalls,
        reward: cfg.reward,
      });
    }),
  );

  app.post(
    "/api/cards",
    wrap(async (req, res) => {
      const nickname = String(req.body?.nickname ?? "").trim().slice(0, 30) || null;
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const r = await pool.query(
          "insert into attendees (code, nickname) values ($1,$2) on conflict (code) do nothing returning *",
          [code, nickname],
        );
        if (r.rows[0]) return res.status(201).json(await cardView(r.rows[0]));
      }
      throw new HttpError(500, "Could not make a code, try again");
    }),
  );

  app.get(
    "/api/cards/:code",
    wrap(async (req, res) => res.json(await cardView(await findAttendee(req.params.code as string)))),
  );

  app.get(
    "/api/qr/:code.svg",
    wrap(async (req, res) => {
      const code = cleanCode(req.params.code);
      res.type("image/svg+xml").send(await QRCode.toString(code, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
    }),
  );

  // Generic QR for the printable sheet (door poster). Short text only.
  app.get(
    "/api/qr.svg",
    wrap(async (req, res) => {
      const text = String(req.query.text ?? "").slice(0, 200);
      if (!text) throw new HttpError(400, "text is required");
      res.type("image/svg+xml").send(await QRCode.toString(text, { type: "svg", margin: 1 }));
    }),
  );

  // ---- stations (volunteers) ----
  const stationAuth = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const pin = String(req.header("x-pin") ?? "");
      const r = await pool.query("select * from stations where pin=$1", [pin]);
      if (!r.rows[0]) throw new HttpError(401, "Wrong PIN");
      (req as any).station = r.rows[0] as Station;
      next();
    } catch (e) {
      next(e);
    }
  };
  const asStation =
    (kind: Station["kind"], fn: (req: Request, res: Response, st: Station) => Promise<unknown>) =>
    [
      stationAuth,
      wrap(async (req, res) => {
        const st = (req as any).station as Station;
        if (st.kind !== kind) throw new HttpError(403, kind === "stall" ? "Use a stall PIN for stamping" : "Only the donut corner can do that");
        return fn(req, res, st);
      }),
    ] as const;

  app.get("/api/station/me", stationAuth, (req, res) => {
    const st = (req as any).station as Station;
    res.json({ id: st.id, name: st.name, kind: st.kind });
  });

  app.post(
    "/api/station/stamp",
    ...asStation("stall", async (req, res, st) => {
      const a = await findAttendee(req.body?.code);
      const r = await pool.query(
        "insert into stamps (attendee_id, stall_id) values ($1,$2) on conflict (attendee_id, stall_id) do nothing returning stall_id",
        [a.id, st.id],
      );
      const card = await cardView(a);
      res.json({ ...card, result: r.rows[0] ? "stamped" : "already", count: card.stamps.length });
    }),
  );

  app.post(
    "/api/station/swag",
    ...asStation("stall", async (req, res, st) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("update stamps set swag_given=$3 where attendee_id=$1 and stall_id=$2", [
        a.id,
        st.id,
        !!req.body?.given,
      ]);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/station/undo",
    ...asStation("stall", async (req, res, st) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("delete from stamps where attendee_id=$1 and stall_id=$2", [a.id, st.id]);
      res.json(await cardView(a));
    }),
  );

  app.post(
    "/api/station/redeem",
    ...asStation("donut", async (req, res) => {
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
    ...asStation("donut", async (req, res) => {
      const a = await findAttendee(req.body?.code);
      await pool.query("update attendees set donut_claimed_at=null where id=$1", [a.id]);
      res.json(await cardView(a));
    }),
  );

  // ---- admin ----
  const adminAuth = (req: Request, _res: Response, next: NextFunction) =>
    next(
      crypto.timingSafeEqual(
        crypto.createHash("sha256").update(String(req.header("x-admin-pin") ?? "")).digest(),
        crypto.createHash("sha256").update(adminPin).digest(),
      )
        ? undefined
        : new HttpError(401, "Wrong admin PIN"),
    );

  app.get(
    "/api/admin/stats",
    adminAuth,
    wrap(async (_req, res) => {
      const stations = (await pool.query("select * from stations order by sort")).rows as Station[];
      const stamps = (await pool.query("select stall_id, swag_given, attendee_id from stamps")).rows as {
        stall_id: string;
        swag_given: boolean;
        attendee_id: number;
      }[];
      const attendees = (await pool.query("select id, donut_claimed_at from attendees")).rows as Attendee[];
      const perAttendee = new Map<number, number>();
      for (const s of stamps) perAttendee.set(s.attendee_id, (perAttendee.get(s.attendee_id) ?? 0) + 1);
      const need = cfg.reward.stampsRequired;
      res.json({
        attendees: attendees.length,
        completed: [...perAttendee.values()].filter((n) => n >= need).length,
        donutsGiven: attendees.filter((a) => a.donut_claimed_at).length,
        donutsOut: (await getSetting("donuts_out")) === "1",
        stamps: stamps.length,
        stations: stations.map((st) => ({
          id: st.id,
          name: st.name,
          kind: st.kind,
          pin: st.pin,
          stamps: stamps.filter((s) => s.stall_id === st.id).length,
          swagGiven: stamps.filter((s) => s.stall_id === st.id && s.swag_given).length,
        })),
      });
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
      if (!cfg.stalls.some((s) => s.id === stallId)) throw new HttpError(400, "Unknown stall");
      if (req.body?.on === false) await pool.query("delete from stamps where attendee_id=$1 and stall_id=$2", [a.id, stallId]);
      else
        await pool.query(
          "insert into stamps (attendee_id, stall_id) values ($1,$2) on conflict (attendee_id, stall_id) do nothing",
          [a.id, stallId],
        );
      res.json(await cardView(a));
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

  app.get(
    "/api/admin/export.csv",
    adminAuth,
    wrap(async (_req, res) => {
      const attendees = (await pool.query("select * from attendees order by id")).rows as Attendee[];
      const stamps = (await pool.query("select attendee_id, stall_id from stamps")).rows as {
        attendee_id: number;
        stall_id: string;
      }[];
      const head = ["code", "nickname", ...cfg.stalls.map((s) => s.id), "donut_claimed"];
      const esc = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""');
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
      if (req.body?.confirm !== "RESET") throw new HttpError(400, 'Send {"confirm":"RESET"}');
      await pool.query("delete from stamps");
      await pool.query("delete from attendees");
      await setSetting("donuts_out", "0");
      res.json({ ok: true });
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Something broke on our side" });
  });

  return app;
}
