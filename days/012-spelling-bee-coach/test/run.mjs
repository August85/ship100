// node days/012-spelling-bee-coach/test/run.mjs
import assert from "node:assert/strict";
import { parseSpelling, parseSpellingRaw, applySteps, bestAlternative, compare, starsFor, pickRound, parseCustomList, spellOut, summarize } from "../speller.js";
import { LEVELS } from "../words.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const letters = (s) => applySteps([], parseSpellingRaw(s).steps).letters.join("");

t("single letters", () => assert.equal(letters("c a t"), "cat"));
t("dashes and caps", () => assert.equal(letters("C-A-T"), "cat"));
t("run-together caps", () => assert.equal(letters("CAT"), "cat"));
t("letter names", () => assert.equal(letters("see ay tea"), "cat"));
t("more names", () => assert.equal(letters("bee are eye dee gee ee"), "bridge"));
t("double you", () => assert.equal(letters("double you eh bee"), "wab"));
t("why and you", () => assert.equal(letters("why ee es"), "yes"));
t("filler ignored", () => assert.equal(letters("um d and then o uh g"), "dog"));
t("oops removes", () => assert.equal(letters("d o x oops g"), "dog"));
t("start over", () => assert.equal(letters("x y start over c a t"), "cat"));
t("done = check", () => assert.equal(applySteps([], parseSpelling("c a t done").steps).check, true));
t("unknown words reported", () => assert.deepEqual(parseSpelling("cat").unknown, ["cat"]));
t("lowercase whole word is not letters", () => assert.equal(letters("cat"), ""));
t("max length", () => assert.equal(applySteps([], parseSpelling("a ".repeat(30)).steps, 20).letters.length, 20));
t("best alternative prefers letters", () => assert.equal(bestAlternative(["seat a tea", "C A T"]).transcript, "C A T"));
t("best alternative keeps recognizer order on a tie", () => assert.equal(bestAlternative(["sea a tea", "C A T"]).transcript, "sea a tea"));

t("compare exact", () => { const c = compare("cat", "cat"); assert.equal(c.distance, 0); assert.ok(c.letters.every((l) => l.ok)); });
t("compare missing letter", () => {
  const c = compare("friend", "frend");
  assert.equal(c.distance, 1);
  assert.deepEqual(c.letters.map((l) => l.ok), [true, true, false, true, true, true]);
});
t("compare swapped", () => assert.deepEqual(compare("because", "becuase").letters.filter((l) => !l.ok).length, 2));
t("compare empty", () => assert.ok(compare("dog", "").letters.every((l) => !l.ok)));

t("stars", () => {
  assert.equal(starsFor({ correct: true, tries: 1, hints: 0 }), 3);
  assert.equal(starsFor({ correct: true, tries: 2, hints: 0 }), 2);
  assert.equal(starsFor({ correct: true, tries: 1, hints: 1 }), 2);
  assert.equal(starsFor({ correct: true, tries: 2, hints: 5 }), 1);
  assert.equal(starsFor({ correct: false, tries: 2, hints: 0 }), 0);
});

t("round picks missed first, distinct", () => {
  for (let k = 0; k < 200; k++) {
    const words = LEVELS[1].words;
    const r = pickRound(words, 10, ["frog", "cake", "notinlist"]);
    assert.equal(r.length, 10);
    assert.equal(new Set(r.map((w) => w.word)).size, 10);
    assert.deepEqual(new Set(r.slice(0, 2).map((w) => w.word)), new Set(["frog", "cake"]));
  }
});
t("round smaller than count", () => assert.equal(pickRound([{ word: "a" }, { word: "b" }], 10).length, 2));

t("custom list", () => assert.deepEqual(parseCustomList("Cat, dog\nDOG  said; x don't 123"), ["cat", "dog", "said", "dont"]));
t("spell out", () => assert.equal(spellOut("cat"), "C. A. T."));
t("summary", () => {
  const s = summarize([{ word: "a", correct: true, stars: 3, tries: 1, hints: 0 }, { word: "b", correct: false, stars: 0, tries: 2, hints: 0 }]);
  assert.deepEqual(s, { stars: 3, maxStars: 6, correct: 1, total: 2, firstTry: 1, missed: ["b"] });
});

t("word lists are clean", () => {
  for (const lvl of LEVELS) {
    assert.equal(new Set(lvl.words.map((w) => w.word)).size, lvl.words.length, lvl.id + " has duplicates");
    for (const w of lvl.words) {
      assert.match(w.word, /^[a-z]+$/);
      assert.ok(w.sentence.toLowerCase().includes(w.word), `${w.word}: sentence should use the word`);
    }
  }
});

console.log(`ok: ${n} checks`);
