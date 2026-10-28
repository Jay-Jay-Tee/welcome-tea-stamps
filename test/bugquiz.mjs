import assert from "node:assert/strict";
import "../public/bug-quiz.js";

const { forCard } = globalThis.BugQuiz;
const first = forCard("A1B2C3D4");
assert.equal(first.length, 7);
assert.deepEqual(first, forCard("A1B2C3D4"), "a card gets the same checks on retry");
assert.notDeepEqual(first, forCard("K8M9N2P3"), "cards do not share one answer sheet");

for (const code of ["A1B2C3D4", "K8M9N2P3", "ZZZZZZZZ", "00000000"]) {
  const tests = forCard(code);
  assert.equal(new Set(tests.map((t) => t.topic)).size, 7, "topics do not repeat on a card");
  assert(tests.some((t) => !t.options), "each card includes typed answers");
  assert(tests.some((t) => t.options), "each card includes choice answers");
  for (const test of tests) {
    assert(test.answer && test.why && test.prompt);
    if (test.options) assert(test.options.includes(test.answer), "correct answer must be offered");
  }
}

console.log("ok: card-specific bug quiz");
