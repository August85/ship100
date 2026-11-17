// Run: node test/run.mjs
import { createGame, factsFor, comboFor, rng, bestKey, trackPositions } from "../game.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };

ok(factsFor([7]).length === 11, "7 table has 11 facts (×2..×12)");
ok(factsFor([3, 3, 2]).length === 22, "duplicates removed");
ok(comboFor(0) === 1 && comboFor(4) === 2 && comboFor(8) === 3, "combo steps");
ok(bestKey([10, 2, 5, 2]) === "ttr-best:2,5,10", "best key sorted + unique");

let threw = false; try { createGame([]); } catch { threw = true; }
ok(threw, "no tables throws");

// Every question is from the chosen tables and the answer is right.
const g = createGame([3, 7], { random: rng(42) });
let last = null, repeats = 0;
for (let i = 0; i < 500; i++) {
  const q = g.pick();
  ok([3, 7].includes(q.a), "a from chosen tables");
  ok(q.left * q.right === q.answer, "answer is product");
  if (q.key === last) repeats++;
  last = q.key;
  g.answer(q.answer);
}
ok(repeats === 0, "never the same fact twice in a row");
ok(g.state.correct === 500 && g.state.score > 500 * 10, "combo boosts score");

// Scoring: 4 right then wrong then right.
const h = createGame([2], { random: rng(1) });
const pts = [];
for (let i = 0; i < 5; i++) { const q = h.pick(); pts.push(h.answer(q.answer).points); }
ok(pts.join() === "10,10,10,10,20", "combo kicks in on 5th right answer: " + pts);
let q = h.pick(); const missKey = q.key;
const r = h.answer(q.answer + 1);
ok(!r.ok && h.state.streak === 0, "wrong resets streak");
// Missed fact comes back within 3 picks.
let back = false;
for (let i = 0; i < 3; i++) { q = h.pick(); if (q.key === missKey) back = true; h.answer(q.answer); }
ok(back, "missed fact comes back within 3 questions");
const s = h.summary();
ok(s.correct === 8 && s.wrong === 1 && s.accuracy === 89, "summary counts " + JSON.stringify(s));
ok(s.missed.length === 1 && s.missed[0].a * s.missed[0].b === Number(missKey.split("x")[0]) * Number(missKey.split("x")[1]), "missed list");

// Track.
const t0 = trackPositions({ correct: 10, elapsed: 30, bestCorrect: 0 });
ok(t0.finish === 20 && t0.you === 0.5 && t0.ghost === null, "first race track");
const t1 = trackPositions({ correct: 30, elapsed: 30, bestCorrect: 24 });
ok(t1.you === 1 && t1.ghost === 0.5, "capped at finish, ghost at half");
ok(trackPositions({ correct: 0, elapsed: 90, bestCorrect: 5 }).ghost === 0.5, "small best uses 10 finish, time capped");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
