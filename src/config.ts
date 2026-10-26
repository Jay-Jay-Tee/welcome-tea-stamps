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

export function loadConfig(path = "config/event.json"): EventConfig {
  return JSON.parse(readFileSync(path, "utf8"));
}
