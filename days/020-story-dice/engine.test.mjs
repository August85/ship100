// Run with: node days/020-story-dice/engine.test.mjs
import assert from "node:assert/strict";
import { DICE, roll, buildStory, storyTitle } from "./engine.js";

// Every die has 12 faces with unique emoji.
for (const d of DICE) {
  assert.equal(d.faces.length, 12, `${d.name} has 12 faces`);
  assert.equal(new Set(d.faces.map((f) => f.e)).size, 12, `${d.name} emoji are unique`);
}

// roll() stays in range, and locked dice keep their face.
let r = [0, 0, 0];
for (let n = 0; n < 500; n++) {
  r = roll(r, [false, true, false]);
  assert.equal(r[1], 0);
  r.forEach((v, i) => assert.ok(v >= 0 && v < DICE[i].faces.length));
}
assert.deepEqual(roll(null, [true, true, true], () => 0.99), [11, 11, 11], "locked with no current rolls anyway");

// Every combination builds a story with no leftover placeholders.
for (let h = 0; h < 12; h++) for (let p = 0; p < 12; p++) for (let x = 0; x < 12; x++) {
  const s = buildStory([h, p, x], (h + p + x) / 40);
  const all = [s.opening, s.twist, ...s.questions, s.speech].join(" ");
  assert.ok(!all.includes("{"), all);
  assert.ok(s.twist.includes(s.hero.short));
  assert.equal(s.questions.length, 3);
}
assert.throws(() => buildStory([12, 0, 0]));
assert.equal(storyTitle([0, 0, 0]), "Ember and the Lost hat");

const s = buildStory([0, 0, 0], 0);
assert.equal(s.opening, "Once upon a time, there was a little dragon called Ember, who lived in a big stone castle.");
assert.equal(s.twist, "One morning, Ember lost a favourite hat!");
console.log("engine ok");
