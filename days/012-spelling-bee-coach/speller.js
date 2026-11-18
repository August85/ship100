// Spelling Bee Coach: pure logic (no DOM), so it can be tested with `node test/run.mjs`.

// What a speech recognizer tends to write when a child says a letter name out loud.
const LETTER_WORDS = {
  a: ["a", "ay", "eh", "hey", "aye"],
  b: ["b", "be", "bee", "bea"],
  c: ["c", "see", "sea", "cee", "si"],
  d: ["d", "dee", "de"],
  e: ["e", "ee"],
  f: ["f", "ef", "eff"],
  g: ["g", "gee", "ji", "jee"],
  h: ["h", "aitch", "haitch", "age", "each", "itch"],
  i: ["i", "eye", "ai"],
  j: ["j", "jay", "jae"],
  k: ["k", "kay", "kai", "cay"],
  l: ["l", "el", "ell", "elle"],
  m: ["m", "em", "im"],
  n: ["n", "en", "an"],
  o: ["o", "oh", "owe", "ow"],
  p: ["p", "pee", "pea", "pe"],
  q: ["q", "queue", "cue", "kew", "kyu"],
  r: ["r", "are", "ar", "our"],
  s: ["s", "es", "ess"],
  t: ["t", "tea", "tee", "ti"],
  u: ["u", "you", "yu", "ewe"],
  v: ["v", "vee", "ve"],
  w: ["w", "dub", "dubya"],
  x: ["x", "ex", "ecks"],
  y: ["y", "why", "wye", "wie"],
  z: ["z", "zee", "zed"],
};
const WORD_TO_LETTER = new Map();
for (const [letter, words] of Object.entries(LETTER_WORDS)) for (const w of words) WORD_TO_LETTER.set(w, letter);

// Spoken commands that edit the answer instead of adding letters.
const COMMANDS = new Map([
  ["delete", "back"], ["backspace", "back"], ["oops", "back"], ["undo", "back"], ["back", "back"],
  ["clear", "clear"], ["restart", "clear"],
  ["done", "check"], ["check", "check"], ["finished", "check"],
]);
const FILLER = new Set(["um", "uh", "er", "erm", "hmm", "and", "then", "letter", "capital", "the", "like", "okay", "ok", "so"]);

/**
 * Turn one recognizer transcript into editing steps.
 * Returns { steps: [{type:"letter", letter} | {type:"back"|"clear"|"check"}], unknown: [words not understood] }.
 * Handles "c a t", "C-A-T", "see ay tea", "double you", "CAT" (letters run together) and "start over".
 */
export function parseSpelling(transcript) {
  const steps = [];
  const unknown = [];
  let text = String(transcript || "").toLowerCase();
  text = text.replace(/double[\s-]*(u|you|yu)\b/g, " w ")
    .replace(/start\s+(again|over)/g, " clear ")
    .replace(/[^a-z\s]/g, " ");
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    if (tok.length === 1) { steps.push({ type: "letter", letter: tok }); continue; }
    if (COMMANDS.has(tok)) { steps.push({ type: COMMANDS.get(tok) }); continue; }
    if (WORD_TO_LETTER.has(tok)) { steps.push({ type: "letter", letter: WORD_TO_LETTER.get(tok) }); continue; }
    if (FILLER.has(tok)) continue;
    unknown.push(tok);
  }
  return { steps, unknown };
}

/** Raw transcripts sometimes come back as "CAT" when a child spells quickly; it was all capitals, so it was letters. */
export function looksLikeRunTogetherLetters(rawToken) {
  return /^[A-Z]{2,12}$/.test(rawToken);
}

/** Parse, but expand all-capital tokens ("CAT") into separate letters first. */
export function parseSpellingRaw(transcript) {
  const fixed = String(transcript || "")
    .split(/(\s+)/)
    .map((t) => (looksLikeRunTogetherLetters(t) ? t.split("").join(" ") : t))
    .join("");
  return parseSpelling(fixed);
}

/** Apply editing steps to a list of letters. Returns { letters, check }. */
export function applySteps(letters, steps, max = 20) {
  const out = letters.slice();
  let check = false;
  for (const s of steps) {
    if (s.type === "letter" && out.length < max) out.push(s.letter);
    else if (s.type === "back") out.pop();
    else if (s.type === "clear") out.length = 0;
    else if (s.type === "check") check = true;
  }
  return { letters: out, check };
}

/** From several recognizer alternatives, pick the one that reads most like spelling (most letters, fewest unknown words). */
export function bestAlternative(transcripts) {
  let best = null;
  for (const t of transcripts) {
    const p = parseSpellingRaw(t);
    const letters = p.steps.filter((s) => s.type === "letter").length;
    const score = letters * 2 - p.unknown.length * 3;
    if (!best || score > best.score) best = { transcript: t, parsed: p, score };
  }
  return best;
}

/**
 * Line up an attempt against the right spelling.
 * Returns one entry per letter of the target: { letter, ok } where ok means the child had it in the right place.
 */
export function compare(target, attempt) {
  const a = target.toLowerCase(), b = attempt.toLowerCase();
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ok = new Array(n).fill(false);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { ok[i - 1] = true; i--; j--; }
    else if (d[i][j] === d[i - 1][j - 1] + 1) { i--; j--; }
    else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return { distance: d[n][m], letters: a.split("").map((letter, k) => ({ letter, ok: ok[k] })) };
}

/** Stars for one word: 3 on the first try, 2 on the second, minus 1 per hint (never below 1), 0 if missed. */
export function starsFor({ correct, tries, hints }) {
  if (!correct) return 0;
  const base = tries <= 1 ? 3 : 2;
  return Math.max(1, base - hints);
}

export const MAX_TRIES = 2;

/** Shuffle (Fisher–Yates) with an injectable random for tests. */
export function shuffle(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick a round: up to `count` distinct words, ones the child missed before first. */
export function pickRound(words, count, missed = [], rand = Math.random) {
  const byWord = new Map(words.map((w) => [w.word, w]));
  const first = shuffle(missed.filter((w) => byWord.has(w)), rand).map((w) => byWord.get(w));
  const rest = shuffle(words.filter((w) => !first.includes(w)), rand);
  return [...first, ...rest].slice(0, count);
}

/** Clean up a parent's typed list ("cat, Dog\nhouse  ") into words. Letters only, 2–20 long, no repeats. */
export function parseCustomList(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || "").split(/[\s,;]+/)) {
    const w = raw.toLowerCase().replace(/[^a-z]/g, "");
    if (w.length < 2 || w.length > 20 || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out.slice(0, 50);
}

/** Letter-by-letter text for speech: "C. A. T." reads as letter names on every engine tried. */
export function spellOut(word) {
  return word.toUpperCase().split("").join(". ") + ".";
}

/** Summary of a finished round. */
export function summarize(results) {
  const stars = results.reduce((s, r) => s + r.stars, 0);
  const correct = results.filter((r) => r.correct).length;
  return {
    stars,
    maxStars: results.length * 3,
    correct,
    total: results.length,
    firstTry: results.filter((r) => r.correct && r.tries === 1 && r.hints === 0).length,
    missed: results.filter((r) => !r.correct).map((r) => r.word),
  };
}
