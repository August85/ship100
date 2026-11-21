// node engine.test.mjs
import assert from "node:assert/strict";
import { QUESTIONS, score, summaryText } from "./engine.js";

const all = (k) => Object.fromEntries(QUESTIONS.map((q) => [q.id, k]));

assert.equal(QUESTIONS.length, 20, "20 questions");
assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 20, "unique ids");

let r = score({});
assert.equal(r.pct, 0); assert.equal(r.answered, 0); assert.equal(r.band.label, "Early days");
assert.equal(r.gaps.length, 20);

r = score(all("done"));
assert.equal(r.pct, 100); assert.equal(r.band.label, "Ready to book"); assert.equal(r.gaps.length, 0); assert.equal(r.criticalOpen, 0);

r = score(all("partly"));
assert.equal(r.pct, 50); assert.equal(r.band.label, "Getting there"); assert.equal(r.criticalOpen, 0);

// "Doesn't apply" drops a question out of the maximum.
const naIds = QUESTIONS.filter((q) => q.naOk).map((q) => q.id);
const mixed = all("done"); for (const id of naIds) mixed[id] = "na";
r = score(mixed);
assert.equal(r.pct, 100, "n/a questions don't drag the score down");
assert.equal(r.answered, 20);

// "na" is ignored (treated as "not yet") where it isn't offered.
const fundNa = all("done"); fundNa.fund = "na";
r = score(fundNa);
assert.ok(r.pct < 100); assert.equal(r.gaps[0].id, "fund");

// Critical not-started gaps rank first.
const oneCrit = all("done"); oneCrit.health = "no"; oneCrit.budget = "no";
r = score(oneCrit);
assert.deepEqual(r.gaps.map((g) => g.id), ["health", "budget"]);
assert.equal(r.criticalOpen, 1);

// Category with every question n/a reports null.
const fam = all("done"); for (const q of QUESTIONS.filter((q) => q.cat === "family")) fam[q.id] = "na";
r = score(fam);
assert.equal(r.categories.find((c) => c.key === "family").pct, null);

assert.match(summaryText(score(oneCrit)), /Readiness: \d+\/100/);
console.log("ok: all engine tests passed");
