export const BUG_STALL = "presidential";
export const MISSION_DONE = 5;
const arranged = (options: string[], seed: number, stage: number) => {
  const offset = (seed + stage * 7) % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
};

type Check = { title: string; prompt: string; options: string[]; answer: number };
type Scene = { title: string; intro: string; logs: string[]; snippet: string; patch: string[]; checks: Check[] };

function sceneFor(seed: number): Scene {
  const id = 10 + seed % 80, stock = 3 + Math.floor(seed / 7) % 4;
  const scenes: Scene[] = [
    {
      title: "The double donut",
      intro: `One tap should reserve one donut. Trace tap #${id} through the retry.`,
      logs: [`tap #${id} received`, `donut reserved; stock ${stock} → ${stock - 1}`, `tap #${id} retried`, `second donut reserved; stock ${stock - 1} → ${stock - 2}`],
      snippet: "function reserve(tapId) {\n  // stop repeated taps here\n  return takeOneDonut();\n}",
      patch: ["if (seen.has(tapId)) return previousResult;", "if (seen.has(tapId)) stock--;", "seen.clear(); // start fresh"],
      checks: [
        { title: "First tap", prompt: `Stock is ${stock}. Tap #${id} arrives once. What should happen?`, options: [`Give one; stock becomes ${stock - 1}`, `Give two; stock becomes ${stock - 2}`, "Give none"], answer: 0 },
        { title: "Retry", prompt: `Tap #${id} arrives again. What should happen?`, options: ["Show the same result; stock stays put", "Give another donut", "Erase the first result"], answer: 0 },
        { title: "Out of stock", prompt: "Stock is 0 and a new tap arrives. What should happen?", options: ["Show sold out; stock stays 0", "Reserve a donut anyway", "Reset the stock"], answer: 0 },
      ],
    },
    {
      title: "The ghost donut",
      intro: `The counter says zero, but tap #${id} still gets a donut. Find the first bad event.`,
      logs: [`tap #${id} received`, "stock read: 0", "donut reserved anyway", "screen says: enjoy your donut"],
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
      snippet: "function stamp(stallId) {\n  // stop duplicate stalls here\n  return addStamp(stallId);\n}",
      patch: ["if (stamps.has(stallId)) return alreadyStamped;", "if (stamps.has(stallId)) count++;", "stamps.clear(); // avoid duplicates"],
      checks: [
        { title: "First visit", prompt: "Tech Cell is scanned for the first time. What happens?", options: ["Add one Tech Cell stamp", "Add two stamps", "Ignore the scan"], answer: 0 },
        { title: "Same stall", prompt: "Tech Cell is scanned again. What happens?", options: ["Show already stamped; count stays put", "Add another stamp", "Remove the first stamp"], answer: 0 },
        { title: "New stall", prompt: "Student Life is scanned next. What happens?", options: ["Add one new stamp", "Ignore it", "Mark the card complete immediately"], answer: 0 },
      ],
    },
  ];
  return scenes[seed % scenes.length];
}

export function missionView(seed: number, stage: number, attempts: number, completed = false) {
  if (completed || stage >= MISSION_DONE) return { stage: "complete", title: "Bug squashed", progress: 5, total: 5 };
  const scene = sceneFor(seed);
  const hint = attempts >= 2 ? (stage === 0 ? "Find the first line that should never have happened." : stage === 1 ? "Keep the normal path; stop the bad one before it changes anything." : "Think about what the person should see and whether the count changes.") : null;
  if (stage === 0) return { stage: "diagnose", title: scene.title, intro: scene.intro, logs: scene.logs, options: arranged(scene.logs.map((_, i) => `Line ${i + 1}`), seed, stage), hint, progress: 0, total: 5 };
  if (stage === 1) return { stage: "patch", title: scene.title, intro: "Choose the one-line fix, then run the tests.", snippet: scene.snippet, options: arranged(scene.patch, seed, stage), hint, progress: 1, total: 5 };
  const check = scene.checks[stage - 2];
  return { stage: "verify", title: check.title, intro: check.prompt, options: arranged(check.options, seed, stage), hint, progress: stage, total: 5 };
}

export function isCorrect(seed: number, stage: number, choice: number) {
  const original = stage === 0 ? seed % 3 === 1 ? 2 : 3 : stage === 1 ? 0 : stage >= 2 && stage < MISSION_DONE ? sceneFor(seed).checks[stage - 2].answer : -1;
  const count = stage === 0 ? 4 : 3;
  return Number.isInteger(choice) && choice >= 0 && choice < count && choice === (original - (seed + stage * 7) % count + count) % count;
}
