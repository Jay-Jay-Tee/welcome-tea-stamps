// The bug hunt's fix word, shared with public/index.html (keep the list and the hash identical there).
// It only gates the Hall of Fame; the rest of the hunt runs in the browser.
export const BUG_STALL = "presidential";
export const FIX_WORDS = ["COMMIT", "MERGE", "PATCH", "DEBUG", "BRANCH", "DEPLOY", "REBASE", "PUSH"];

export const fixWordFor = (code: string) =>
  FIX_WORDS[[...code].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % FIX_WORDS.length];
