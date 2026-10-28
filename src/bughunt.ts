export const BUG_STALL = "presidential";
export const MISSION_DONE = 5;
// Wrong answers cost a heart. Losing the last one reboots the lab with a different bug.
export const HEARTS = 3;
const arranged = (options: string[], seed: number, stage: number) => {
  const offset = (seed + stage * 7) % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
};

type Check = { title: string; prompt: string; options: string[]; answer: number };
// fault: index of the first log line that should never have happened.
type Scene = { title: string; intro: string; logs: string[]; fault: number; snippet: string; patch: string[]; checks: Check[] };

function sceneFor(seed: number): Scene {
  const stock = 3 + Math.floor(seed / 7) % 4;
  const scenes: Scene[] = [
    {
      title: "The double donut",
      intro: "One tap should reserve one donut. Watch what happens when the same tap is retried.",
      logs: ["first tap received", `donut reserved; stock ${stock} → ${stock - 1}`, "same tap retried", `second donut reserved; stock ${stock - 1} → ${stock - 2}`],
      fault: 3,
      snippet: "function reserve(tapId) {\n  // stop repeated taps here\n  return takeOneDonut();\n}",
      patch: ["if (seen.has(tapId)) return previousResult;", "if (seen.has(tapId)) stock--;", "seen.clear(); // start fresh"],
      checks: [
        { title: "First tap", prompt: `Stock is ${stock}. A person taps once. What should happen?`, options: [`Give one; stock becomes ${stock - 1}`, `Give two; stock becomes ${stock - 2}`, "Give none"], answer: 0 },
        { title: "Retry", prompt: "The same tap arrives again. What should happen?", options: ["Show the same result; stock stays put", "Give another donut", "Erase the first result"], answer: 0 },
        { title: "Out of stock", prompt: "Stock is 0 and a new tap arrives. What should happen?", options: ["Show sold out; stock stays 0", "Reserve a donut anyway", "Reset the stock"], answer: 0 },
      ],
    },
    {
      title: "The ghost donut",
      intro: "The counter says zero, but someone still gets a donut. Find the first bad event.",
      logs: ["tap received", "stock read: 0", "donut reserved anyway", "screen says: enjoy your donut"],
      fault: 2,
      snippet: "function reserve(stock) {\n  // guard an empty tray here\n  return takeOneDonut();\n}",
      patch: ["if (stock <= 0) return soldOut;", "if (stock <= 0) stock--;", "stock = 1; // just in case"],
      checks: [
        { title: "Empty tray", prompt: "Stock is 0. What should the card show?", options: ["Sold out, with no reservation", "A free donut", "A negative stock count"], answer: 0 },
        { title: "Last donut", prompt: "Stock is 1. One person taps. What happens?", options: ["Give one; stock becomes 0", "Show sold out", "Give two"], answer: 0 },
        { title: "After the last", prompt: "Another person taps after stock reaches 0. What happens?", options: ["Show sold out; keep stock at 0", "Give one more", "Reset stock to 1"], answer: 0 },
      ],
    },
    {
      title: "The phantom stamp",
      intro: "The same stall was counted twice on a test card. Find the first bad event.",
      logs: ["Tech Cell stamp saved", "Student Life stamp saved", "Tech Cell stamp scanned again", "duplicate counted as a new stamp"],
      fault: 3,
      snippet: "function stamp(stallId) {\n  // stop duplicate stalls here\n  return addStamp(stallId);\n}",
      patch: ["if (stamps.has(stallId)) return alreadyStamped;", "if (stamps.has(stallId)) count++;", "stamps.clear(); // avoid duplicates"],
      checks: [
        { title: "First visit", prompt: "Tech Cell is scanned for the first time. What happens?", options: ["Add one Tech Cell stamp", "Add two stamps", "Ignore the scan"], answer: 0 },
        { title: "Same stall", prompt: "Tech Cell is scanned again. What happens?", options: ["Show already stamped; count stays put", "Add another stamp", "Remove the first stamp"], answer: 0 },
        { title: "New stall", prompt: "Student Life is scanned next. What happens?", options: ["Add one new stamp", "Ignore it", "Mark the card complete immediately"], answer: 0 },
      ],
    },
    // The next three are real bugs found and fixed while building this site. Wrong options are meant to look plausible.
    {
      title: "The double redeem",
      intro: "Two volunteers scan the same full card at the same moment. The card should only ever get one donut.",
      logs: ["volunteer A reads card: donut not claimed", "volunteer B reads card: donut not claimed", "volunteer A saves: donut claimed", "volunteer B saves: donut claimed again"],
      fault: 3,
      snippet: "async function redeem(card) {\n  if (card.claimed) return 'already';\n  // A and B can both get past the check\n  await save({ claimed: true });\n  return 'give donut';\n}",
      patch: ["Save only if still unclaimed (UPDATE ... WHERE claimed = false) and check a row changed", "Check card.claimed a second time just before saving", "Wait 100ms before saving so the other volunteer finishes first"],
      checks: [
        { title: "Same moment", prompt: "A and B scan the same card at the same instant. How many donuts go out?", options: ["Exactly one", "Two, one from each volunteer", "None, both are refused"], answer: 0 },
        { title: "The loser", prompt: "B's save changes 0 rows because A got there first. What should B's screen say?", options: ["Already collected", "Give them a donut", "An error, then reload the page"], answer: 0 },
        { title: "Why not check twice?", prompt: "Why doesn't checking card.claimed a second time fix it?", options: ["Both can still pass the check before either one saves", "JavaScript runs if statements in random order", "The database ignores the second check"], answer: 0 },
      ],
    },
    {
      title: "The nickname that ran code",
      intro: "Someone set their nickname to a piece of HTML. When a volunteer scanned them, the volunteer's phone ran it.",
      logs: ["card created, nickname: <img src=x onerror=steal()>", "volunteer scans the card", "result built as HTML: 'Stamped ' + nickname", "volunteer's browser runs steal()"],
      fault: 2,
      snippet: "function showResult(nickname) {\n  // nickname was typed by the attendee\n  result.innerHTML = 'Stamped ' + nickname;\n}",
      patch: ["result.textContent = 'Stamped ' + nickname;", "result.innerHTML = 'Stamped ' + nickname.trim();", "result.innerHTML = 'Stamped ' + nickname.replace('script', '');"],
      checks: [
        { title: "Fixed output", prompt: "With the fix, the nickname is <b>Ada</b>. What does the volunteer see?", options: ["The text <b>Ada</b>, tags and all", "Ada in bold", "Nothing at all"], answer: 0 },
        { title: "Also safe", prompt: "Which of these would also have stopped it?", options: ["Escaping < > & \" ' before using innerHTML", "Removing the word script from nicknames", "Limiting nicknames to 30 characters"], answer: 0 },
        { title: "What was at risk", prompt: "Why did this matter on a volunteer's phone?", options: ["The code could read the stall's saved login and stamp anyone", "It could crash the server", "It could change the donut price"], answer: 0 },
      ],
    },
    {
      title: "The five-stamp freeze",
      intro: "A card with all 5 stamps still says it isn't done. The donut corner keeps turning them away.",
      logs: ["5th stamp saved", "stamps on card: 5", "card complete? false", "donut corner says: not a full card"],
      fault: 2,
      snippet: "const NEEDED = 5;\nfunction isComplete(stamps) {\n  return stamps.length > NEEDED;\n}",
      patch: ["return stamps.length >= NEEDED;", "return stamps.length > NEEDED + 1;", "return stamps.length < NEEDED;"],
      checks: [
        { title: "Four stamps", prompt: "With the fix, a card has 4 stamps. Is it complete?", options: ["No, one to go", "Yes", "Only after a refresh"], answer: 0 },
        { title: "Five stamps", prompt: "With the fix, a card has 5 stamps. Is it complete?", options: ["Yes", "No, it needs 6", "Only if they scan again"], answer: 0 },
        { title: "Name the bug", prompt: "What kind of bug was this?", options: ["Off-by-one", "Race condition", "Memory leak"], answer: 0 },
      ],
    },
    {
      title: "The midnight reset",
      intro: "At 7:30am on event day, cards say the event hasn't started yet. The server thinks it's still yesterday.",
      logs: ["7:30am Singapore time: card opened", "server clock reads 23:30 UTC, 27 Oct", "event-day check compares 27 Oct to 28 Oct", "card says: the event hasn't started"],
      fault: 2,
      snippet: "const EVENT_DAY = '2026-10-28';\nfunction isEventDay() {\n  const today = new Date().toISOString().slice(0, 10);\n  return today === EVENT_DAY;\n}",
      patch: ["Work out today's date in Singapore time (Asia/Singapore), not UTC", "Add 8 hours, but only after 4pm", "Compare the hour instead of the date"],
      checks: [
        { title: "Early morning", prompt: "With the fix, it's 7:30am Singapore time on 28 Oct. Is it event day?", options: ["Yes", "No, it's still 27 Oct", "Only after noon"], answer: 0 },
        { title: "Why it broke", prompt: "Why did the old check get the date wrong?", options: ["toISOString() gives the UTC date, 8 hours behind Singapore", "JavaScript can't store October", "The server's clock was broken"], answer: 0 },
        { title: "Good habit", prompt: "What's the safest rule for date checks like this?", options: ["Compare dates in one stated time zone", "Trust whatever the phone's clock says", "Guess the time zone from the IP address"], answer: 0 },
      ],
    },
    {
      title: "The vanishing offline stamp",
      intro: "The wifi dropped at a stall. The volunteer's phone saved the stamp to send later, but the stamp never arrived.",
      logs: ["wifi drops at the stall", "stamp saved on the volunteer's phone", "wifi back: retry gets 503 (server busy)", "stamp deleted from the phone's queue"],
      fault: 3,
      snippet: "for (const code of queue) {\n  try { await sendStamp(code); remove(code); }\n  catch (e) { remove(code); // give up\n  }\n}",
      patch: ["Keep it queued unless the server says the card doesn't exist (404)", "Remove it after the first failed retry", "Keep retrying forever, even for cards that don't exist"],
      checks: [
        { title: "Server busy", prompt: "A retry gets 503 (server busy). What happens to the stamp?", options: ["Stays queued for the next retry", "Deleted", "Counted twice"], answer: 0 },
        { title: "No such card", prompt: "A retry gets 404 (no card with that code). What now?", options: ["Drop it; that card doesn't exist", "Keep retrying forever", "Create a new card"], answer: 0 },
        { title: "Safe to retry", prompt: "Why is it safe to send the same stamp more than once?", options: ["The server ignores a stamp it already has", "Phones never actually retry", "Stamps expire after a minute"], answer: 0 },
      ],
    },
    {
      title: "The stale page",
      intro: "A fix went live, but phones kept showing the old, buggy page.",
      logs: ["new version deployed to the server", "phone opens the stamp card", "service worker serves the saved v11 page", "old bug still on screen"],
      fault: 2,
      snippet: "const CACHE = 'stamps-v11';\n// page files come from CACHE before the network",
      patch: ["Bump the cache name (stamps-v12) and fetch from the network first", "Ask everyone at the event to clear their browser", "Delete the service worker file from the server"],
      checks: [
        { title: "Next change", prompt: "You edit index.html again. What else should change?", options: ["The cache version name", "Nothing", "The website's domain"], answer: 0 },
        { title: "Network first", prompt: "\"Network first\" means the page...", options: ["Tries the server, and uses the saved copy only if offline", "Always uses the saved copy", "Never saves a copy"], answer: 0 },
        { title: "Why keep it", prompt: "Why have a service worker at all?", options: ["So the card still opens when the venue wifi dies", "To make pages load slower", "To track who visits"], answer: 0 },
      ],
    },
  ];
  return scenes[seed % scenes.length];
}

export const SCENE_COUNT = 9;
export const sceneIndex = (seed: number) => seed % SCENE_COUNT;

export function missionView(seed: number, stage: number, attempts: number, completed = false, mistakes = 0) {
  const hearts = Math.max(0, HEARTS - mistakes);
  if (completed || stage >= MISSION_DONE) return { stage: "complete", title: "Bug squashed", progress: 5, total: 5, hearts, maxHearts: HEARTS };
  const scene = sceneFor(seed);
  const hint = attempts >= 2 ? (stage === 0 ? "Find the first line that should never have happened." : stage === 1 ? "Keep the normal path; stop the bad one before it changes anything." : "Think about what the person should see and whether the count changes.") : null;
  if (stage === 0) return { stage: "diagnose", title: scene.title, intro: scene.intro, logs: scene.logs, options: scene.logs.map((_, i) => `Line ${i + 1}`), hint, progress: 0, total: 5, hearts, maxHearts: HEARTS };
  if (stage === 1) return { stage: "patch", title: scene.title, intro: "Choose the one-line fix, then run the tests.", snippet: scene.snippet, options: arranged(scene.patch, seed, stage), hint, progress: 1, total: 5, hearts, maxHearts: HEARTS };
  const check = scene.checks[stage - 2];
  return { stage: "verify", title: check.title, intro: check.prompt, options: arranged(check.options, seed, stage), hint, progress: stage, total: 5, hearts, maxHearts: HEARTS };
}

export function isCorrect(seed: number, stage: number, choice: number) {
  const original = stage === 0 ? sceneFor(seed).fault : stage === 1 ? 0 : stage >= 2 && stage < MISSION_DONE ? sceneFor(seed).checks[stage - 2].answer : -1;
  const count = stage === 0 ? 4 : 3;
  return Number.isInteger(choice) && choice >= 0 && choice < count && choice === (stage === 0 ? original : (original - (seed + stage * 7) % count + count) % count);
}
