// node engine.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitSentences, fiveBullets, pickPaper, shiftDate, defaultDate, authorLine, parseModelBullets, tidy, asText } from "./engine.js";

// Sentence splitting keeps abbreviations and decimals together
assert.deepEqual(
  splitSentences("Models e.g. GPT do well at 3.5 points. However, Smith et al. found gaps in them. We fix this today."),
  ["Models e.g. GPT do well at 3.5 points.", "However, Smith et al. found gaps in them.", "We fix this today."]);
assert.deepEqual(splitSentences(""), []);

// Tidy drops connective openers and caps length
assert.equal(tidy("However, existing methods fail badly."), "Existing methods fail badly.");
assert.ok(tidy(Array(60).fill("word").join(" ")).endsWith("…"));

// Five bullets on every sample paper, each sentence used once, in fixed role order
const sample = JSON.parse(readFileSync(new URL("./sample.json", import.meta.url)));
for (const { paper } of sample.papers) {
  const b = fiveBullets(paper.summary);
  assert.equal(b.length, 5, paper.title);
  assert.deepEqual(b.map((x) => x.key), ["problem", "gap", "did", "result", "matters"]);
  assert.equal(new Set(b.map((x) => x.index)).size, 5);
}
const first = fiveBullets(sample.papers[0].paper.summary);
assert.match(first.find((x) => x.key === "did").text, /^We introduce Mind2Act World/);
assert.match(fiveBullets(sample.papers[1].paper.summary).find((x) => x.key === "result").text, /95\.2%/);

// Short abstracts give fewer bullets, never crash
assert.equal(fiveBullets("We propose a thing that works. It beats baselines by 4%.").length, 2);

// Picking: upvotes, then comments, then id
const picked = pickPaper([
  { paper: { id: "2611.2", upvotes: 5 }, numComments: 1 },
  { paper: { id: "2611.1", upvotes: 9 }, numComments: 0 },
  { paper: { id: "2611.3", upvotes: 5 }, numComments: 4 },
  { nope: true },
]);
assert.deepEqual(picked.map((e) => e.paper.id), ["2611.1", "2611.3", "2611.2"]);

// Dates
assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
assert.equal(defaultDate(new Date("2026-11-23T03:00:00Z")), "2026-11-22");

// Authors
assert.equal(authorLine([{ name: "A" }, { name: "B" }]), "A, B");
assert.equal(authorLine([1, 2, 3, 4, 5, 6].map((n) => ({ name: `N${n}` }))), "N1, N2, N3, N4 + 2 more");

// Model reply parsing
const parsed = parseModelBullets("- The problem: Robots forget.\n- **The gap:** Tests mix things.\n- What they did: A benchmark.\n- Key result: 12% vs 52%.\n- Why it matters: Composition is hard.");
assert.equal(parsed.length, 5);
assert.deepEqual(parsed[1], { key: "gap", label: "The gap", text: "Tests mix things." });

// Text export
assert.match(asText({ id: "2611.1", title: "T" }, parsed), /^T\nhttps:\/\/arxiv\.org\/abs\/2611\.1\n\n• The problem: Robots forget\./);

console.log("engine tests passed");
