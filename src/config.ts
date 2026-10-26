import { readFileSync } from "node:fs";

export type EventConfig = {
  name: string;
  date: string;
  time: string;
  venue: string;
  stalls: { id: string; name: string }[];
  reward: {
    id: string;
    label: string;
    stampsRequired: number;
    station: { id: string; name: string };
  };
};

// Fail at boot, not on the day, if the config can never produce a full card.
export function validateConfig(cfg: EventConfig): EventConfig {
  const ids = [...cfg.stalls.map((s) => s.id), cfg.reward.station.id];
  if (new Set(ids).size !== ids.length) throw new Error("config: stall and station ids must be unique");
  if (!ids.every((id) => /^[a-z0-9-]+$/.test(id))) throw new Error("config: ids must be lowercase letters, digits, hyphens");
  const n = cfg.reward.stampsRequired;
  if (!Number.isInteger(n) || n < 1 || n > cfg.stalls.length)
    throw new Error(`config: stampsRequired must be between 1 and the number of stalls (${cfg.stalls.length})`);
  return cfg;
}

export function loadConfig(path = "config/event.json"): EventConfig {
  return validateConfig(JSON.parse(readFileSync(path, "utf8")));
}
