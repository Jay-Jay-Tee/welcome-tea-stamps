// Name check for nicknames and Hall of Fame names, which show on a public screen.
// Refuses swearing and slurs (English and Singlish), links, @handles, emails, phone numbers and symbol-only names.
// It will miss things; admin "Hide name" is the backstop.

// Digit and symbol stand-ins people use to dodge filters.
const LOOKALIKE: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", $: "s", "!": "i", "|": "i", "+": "t" };

// Matched anywhere in the squashed-together name (long enough to rarely appear inside innocent words).
const ANYWHERE = [
  "fuck", "fck", "bitch", "cunt", "pussy", "whore", "slut", "nigger", "nigga", "faggot", "retard", "penis", "vagina",
  "bastard", "wank", "twat", "hitler", "molest", "pedophile", "paedophile", "jizz", "dildo", "horny", "onlyfans", "boobs",
  "porno", "pornhub", "bullshit", "shitty", "asshole", "dumbass", "motherf", "blowjob", "handjob", "milf",
  "kanina", "kannina", "chibai", "cheebye", "jibai", "lanjiao", "lanjiu", "nabei", "pukimak", "butoh", "pundek",
];
// Matched only as a whole word, because they hide inside real names:
// shit (Shi Ting), porn (Pornthip), nazi (Nazira), sohai (Sohail), rapist (therapist), pedo (torpedo), ass (Cassandra), dick (Dickson).
const WHOLE_WORD = [
  "shit", "porn", "nazi", "sohai", "rapist", "pedo", "paedo", "ass", "arse", "cock", "dick", "fag", "sex", "sexy", "tits", "tit",
  "anal", "anus", "cum", "rape", "nude", "naked", "kys", "knn", "cb", "ccb", "nbcb", "lj", "diu", "puki", "kote", "chink",
  "gook", "keling", "fk", "wtf", "stfu",
];

const words = (s: string) => s.split(/[^a-z]+/).filter(Boolean);

export type NameCheck = { ok: true; name: string | null } | { ok: false; reason: string };

export function checkName(raw: unknown, maxLength: number): NameCheck {
  const name = String(raw ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  if (!name) return { ok: true, name: null };
  const lower = name.toLowerCase();
  if (/https?:|www\.|\.(com|net|org|sg|io|me|ly|gg|xyz)\b/.test(lower)) return { ok: false, reason: "No links in names, please." };
  if (/@\w|\S+@\S+/.test(lower)) return { ok: false, reason: "No handles or emails in names, please." };
  if ((lower.match(/\d/g) || []).length >= 6) return { ok: false, reason: "No phone numbers in names, please." };
  if (!/\p{L}/u.test(name)) return { ok: false, reason: "Use at least one letter, please." };
  const mapped = [...lower].map((c) => LOOKALIKE[c] ?? c).join("");
  const squashed = mapped.replace(/[^a-z]/g, "");
  // Letters spaced out with dots or spaces ("f u c k") get caught by the squashed check too.
  if (ANYWHERE.some((w) => squashed.includes(w))) return { ok: false, reason: "Please choose a different name." };
  const tokens = new Set([...words(mapped), ...words(lower)]);
  if (WHOLE_WORD.some((w) => tokens.has(w))) return { ok: false, reason: "Please choose a different name." };
  return { ok: true, name };
}
