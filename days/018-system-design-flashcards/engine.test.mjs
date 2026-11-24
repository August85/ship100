import assert from "node:assert/strict";
import { schedule, GRADES, buildQueue, counts, requeue, streak, forecast, dayNumber, formatDays, previewLabel } from "./engine.js";

const T = 20000;
// New card
let s = schedule(undefined, GRADES.good, T);
assert.deepEqual([s.due, s.ivl, s.reps], [T + 1, 1, 1]);
s = schedule(s, GRADES.good, T + 1);
assert.equal(s.ivl, 3); // max(2, round(1*2.5)=3)
s = schedule(s, GRADES.good, T + 4);
assert.equal(s.ivl, 8);
// Easy on a new card
assert.equal(schedule(undefined, GRADES.easy, T).ivl, 4);
// Again on a new card stays due today, no lapse
let a = schedule(undefined, GRADES.again, T);
assert.deepEqual([a.due, a.reps, a.lapses, a.seen], [T, 0, 0, true]);
// ...and is now a learning card: due today, no longer counted as new
assert.deepEqual(buildQueue([{ id: "x" }], { x: a }, T, 0).map((c) => c.id), ["x"]);
assert.equal(schedule(a, GRADES.good, T).ivl, 1);
// Lapse on a review card
const lapsed = schedule(s, GRADES.again, T + 12);
assert.equal(lapsed.lapses, 1);
assert.equal(lapsed.ease, 2.3);
assert.equal(lapsed.due, T + 12);
const relearn = schedule(lapsed, GRADES.good, T + 12);
assert.equal(relearn.ivl, 1);
// Ease floor
let e = { due: T, ivl: 5, ease: 1.35, reps: 4, lapses: 0 };
assert.equal(schedule(e, GRADES.hard, T).ease, 1.3);
assert.equal(schedule(e, GRADES.hard, T).ivl, 6);
// Queue: due reviews first (most overdue first), then limited new
const cards = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
const st = { a: { due: T, ivl: 3, ease: 2.5, reps: 2 }, b: { due: T - 5, ivl: 3, ease: 2.5, reps: 2 }, c: { due: T + 3, ivl: 3, ease: 2.5, reps: 2 } };
assert.deepEqual(buildQueue(cards, st, T, 1).map((c) => c.id), ["b", "a", "d"]);
assert.deepEqual(buildQueue(cards, st, T, 0).map((c) => c.id), ["b", "a"]);
assert.deepEqual(counts(cards, st, T), { due: 2, fresh: 2, learned: 3, mature: 0, total: 5 });
assert.deepEqual(forecast(cards, st, T, 5), [2, 0, 0, 1, 0]);
// Requeue
assert.deepEqual(requeue([1, 2, 3, 4, 5], 9), [1, 2, 3, 9, 4, 5]);
assert.deepEqual(requeue([1], 9), [1, 9]);
// Streak
assert.equal(streak([T, T - 1, T - 2, T - 4], T), 3);
assert.equal(streak([T - 1, T - 2], T), 2);
assert.equal(streak([T - 3], T), 0);
// Dates and labels
assert.equal(dayNumber(new Date(2026, 10, 24, 23, 30)) - dayNumber(new Date(2026, 10, 24, 0, 5)), 0);
assert.equal(dayNumber(new Date(2026, 10, 25, 0, 1)) - dayNumber(new Date(2026, 10, 24, 23, 59)), 1);
assert.deepEqual([0, 1, 13, 21, 90, 400].map(formatDays), ["now", "1d", "13d", "3w", "3mo", "1.1y"]);
assert.equal(previewLabel(undefined, GRADES.again, T), "now");
console.log("engine tests passed");
