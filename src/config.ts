import { readFileSync } from "node:fs";

// icon is a name from public/icons.js, color a #rrggbb hex. Both optional.
export type Look = { id: string; name: string; icon?: string; color?: string };

export type EventConfig = {
  name: string;
  date: string;
  time: string;
  venue: string;
  stalls: Look[];
  reward: {
    id: string;
    label: string;
    stampsRequired: number;
    station: Look;
  };
};

// Fail at boot, not on the day, if the config can never produce a full card.
export function validateConfig(cfg: EventConfig): EventConfig {
  const ids = [...cfg.stalls.map((s) => s.id), cfg.reward.station.id];
  if (new Set(ids).size !== ids.length) throw new Error("config: stall and station ids must be unique");
  if (!ids.every((id) => /^[a-z0-9-]+$/.test(id))) throw new Error("config: ids must be lowercase letters, digits, hyphens");
  for (const s of [...cfg.stalls, cfg.reward.station])
    if (s.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(s.color)) throw new Error(`config: ${s.id} color must look like #365486`);
  const n = cfg.reward.stampsRequired;
  if (!Number.isInteger(n) || n < 1 || n > cfg.stalls.length)
    throw new Error(`config: stampsRequired must be between 1 and the number of stalls (${cfg.stalls.length})`);
  return cfg;
}

export function loadConfig(path = "config/event.json"): EventConfig {
  return validateConfig(JSON.parse(readFileSync(path, "utf8")));
}
