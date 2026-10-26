import crypto from "node:crypto";

// Card codes and station keys are shown on screens and read aloud, so they must never spell anything rude.
// 1. No vowels (A E I O U) and no digits that pass for them (0 1 3 4). Also drops L, which reads as 1.
// 2. Whatever slips through as consonant clusters or digit stand-ins is caught by BLOCKED and rerolled.
export const ALPHABET = "BCDFGHJKMNPQRSTVWXYZ256789";
const LEN_RE = (n: number) => new RegExp(`^[B-DF-HJKMNP-TV-Z25-9]{${n}}$`);
export const CODE_RE = LEN_RE(8);
export const KEY_RE = LEN_RE(16);

// Digits that stand in for letters once vowels are gone.
const LOOKALIKE: Record<string, string> = { "5": "S", "7": "T", "8": "B", "9": "G", "6": "G", "2": "Z" };

const BLOCKED = [
  "FCK", "FK", "FKN", "FGT", "FFS", "MF", "MTHR", "WTF", "STFU", "GTFO",
  "SHT", "CNT", "KNT", "DCK", "DK", "DMN", "GDDM", "BTCH", "BCH", "TWT", "WNK",
  "PSS", "PSSY", "PSY", "PNS", "PRN", "SX", "SXY", "CM", "JZ", "BJ", "HJ",
  "SLT", "HR", "WHR", "THT", "TTS", "NGR", "NGG", "NZ", "KKK", "XXX", "RP",
  "KYS", "SCK", "SCKS", "DLD", "VGN", "CHNK", "SPC", "GK",
];
// Number jokes, checked on the raw code before digits are mapped.
const BLOCKED_RAW = ["69", "666", "88"];

export function isClean(code: string) {
  if (BLOCKED_RAW.some((b) => code.includes(b))) return false;
  const letters = [...code].map((c) => LOOKALIKE[c] ?? c).join("");
  return !BLOCKED.some((b) => letters.includes(b));
}

export function randomCode(len: number) {
  for (;;) {
    const code = Array.from({ length: len }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
    if (isClean(code)) return code;
  }
}
