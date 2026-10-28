// Deterministic, card-specific debugging checks. Kept separate from the page so the
// question builder can be exercised without a browser or a database.
(function (root) {
  function hash(s) {
    return [...String(s)].reduce((h, ch) => (Math.imul(h, 33) + ch.charCodeAt(0)) >>> 0, 11);
  }
  function makeRandom(seed) {
    let state = seed;
    return (min, max) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return min + state % (max - min + 1);
    };
  }
  function shuffle(items, random) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = random(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function forCard(code) {
    const random = makeRandom(hash(code));
    const a = random(2, 8), b = random(3, 9), c = random(4, 10);
    const mapped = [a, b, c].map((n, i) => n + i).filter((n) => n % 2 === 0);
    const jsAnswer = mapped.reduce((sum, n) => sum + n, 0);
    const p = random(3, 9), q = random(2, 8), r = random(4, 10), s = random(5, 11);
    const rows = ["A", "B", "A", "C", "B", "D"].slice(0, random(4, 6));
    const distinct = new Set(rows).size;
    const stamps = ["tech", "tech", "club", "donut"].slice(0, random(3, 4));
    const colors = shuffle(["blue", "pink", "green"], random);
    const tests = [
      {
        topic: "JavaScript · trace",
        prompt: "What number does this log? Follow the map, filter, then reduce.",
        snippet: `const xs = [${a}, ${b}, ${c}];\nconst ys = xs.map((n, i) => n + i)\n  .filter(n => n % 2 === 0);\nconsole.log(ys.reduce((sum, n) => sum + n, 0));`,
        answer: String(jsAnswer),
        why: `The mapped values are ${[a, b + 1, c + 2].join(", ")}; only even values remain, summing to ${jsAnswer}.`,
      },
      {
        topic: "Python · mutation",
        prompt: "What number is printed? The two names point at the same list.",
        snippet: `items = [${p}, ${q}, ${r}]\nalias = items\nalias.pop(1)\nitems.append(${s})\nprint(alias[-2] + len(items))`,
        answer: String(r + 3),
        why: `Both names share one list. After the pop and append it is [${p}, ${r}, ${s}], so ${r} + 3 = ${r + 3}.`,
      },
      {
        topic: "Git · recovery",
        prompt: "You committed too early. Keep the file changes staged, but remove the last local commit. Which command?",
        options: ["git reset --soft HEAD~1", "git reset --hard HEAD~1", "git revert HEAD"],
        answer: "git reset --soft HEAD~1",
        why: "--soft moves HEAD back while leaving the index and worktree as they were.",
      },
      {
        topic: "HTTP · retries",
        prompt: "A phone retries a stamp request after a timeout. Which server rule prevents a second stamp for that stall?",
        options: ["A unique key on card and stall", "A longer client timeout", "A new QR code for each retry"],
        answer: "A unique key on card and stall",
        why: "The database must reject the same card and stall pair twice, even if requests race.",
      },
      {
        topic: "SQL · duplicates",
        prompt: "What does this query return for these stamp rows?",
        snippet: `attendee_id: ${rows.join(", ")}\nSELECT COUNT(DISTINCT attendee_id) FROM stamps;`,
        answer: String(distinct),
        why: `The distinct attendee IDs are ${[...new Set(rows)].join(", ")}, so the count is ${distinct}.`,
      },
      {
        topic: "CSS · cascade",
        prompt: "A donut has class='donut' and sits inside #card. What color wins?",
        snippet: `.donut { color: ${colors[0]}; }\n#card .donut { color: ${colors[1]}; }\n.card .donut { color: ${colors[2]}; }`,
        options: colors,
        answer: colors[1],
        why: "The selector with #card has an ID, so it beats the class-only selectors.",
      },
      {
        topic: "Stamp card · logic",
        prompt: `A card needs ${stamps.length} different stalls. Its raw stamps are ${JSON.stringify(stamps)}. What count should the completion check use?`,
        answer: String(new Set(stamps).size),
        why: `Repeated stamps don't count twice. There are ${new Set(stamps).size} distinct stalls.`,
      },
      {
        topic: "Web security · output",
        prompt: "A nickname is inserted into HTML. Which operation prevents <script> from becoming an element?",
        options: ["Escape HTML special characters", "Convert the name to uppercase", "Trim whitespace"],
        answer: "Escape HTML special characters",
        why: "Escaping < and > makes the input text rather than executable markup.",
      },
    ];
    return shuffle(tests, random).slice(0, 7).map((test) => ({
      ...test,
      options: test.options ? shuffle(test.options, random) : undefined,
    }));
  }
  root.BugQuiz = { forCard };
})(typeof window === "undefined" ? globalThis : window);
