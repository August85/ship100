// Pure logic for AI Paper of the Day: picking the paper and turning an abstract
// into five labelled bullets without any AI. No DOM here, so it can be tested in Node.

const ABBREV = /\b(e\.g|i\.e|et al|etc|vs|cf|Fig|Eq|Sec|approx|resp|No)\.$/i;

/** Split an abstract into sentences without breaking on "e.g.", "3.5" or "et al.". */
export function splitSentences(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out = [];
  let buf = "";
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(\[])/);
  for (const part of parts) {
    buf = buf ? `${buf} ${part}` : part;
    if (ABBREV.test(buf)) continue;
    out.push(buf);
    buf = "";
  }
  if (buf) out.push(buf);
  return out.filter((s) => s.split(" ").length >= 4);
}

const ROLES = [
  { key: "did", label: "What they did",
    cues: [/\bwe (introduce|propose|present|develop|build|design|release|construct|curate|study|investigate|explore|train)\b/i,
           /\b(this|our) (paper|work|study)\b/i, /\bwe\b/i] },
  { key: "result", label: "Key result",
    cues: [/\d+(\.\d+)?\s?(%|x|×|points?|pp)\b/i, /\b(outperform|surpass|achiev|improv|state-of-the-art|SOTA|beats?|reduc|speed)/i,
           /\b(experiments?|results?|evaluation) (show|demonstrate|reveal)/i, /\d/] },
  { key: "gap", label: "The gap",
    cues: [/\b(however|yet|but|despite|although|while)\b/i, /\b(existing|current|prior|previous) (methods?|approaches|work|models?|benchmarks?)\b/i,
           /\b(lack|limited|struggle|fail|costly|expensive|challeng|bottleneck|remain)/i] },
  { key: "problem", label: "The problem",
    cues: [/\b(aims?|goal|task|problem|crucial|important|key|essential|increasingly|widely)\b/i] },
  { key: "matters", label: "Why it matters",
    cues: [/\b(findings|suggest|enable|implication|open[- ]source|release|publicly|available|code|pave|future|insight)\b/i] },
];

const ORDER = ["problem", "gap", "did", "result", "matters"];

function score(sentence, role, index, total) {
  let s = 0;
  role.cues.forEach((re, i) => { if (re.test(sentence)) s += role.cues.length - i; });
  const pos = total > 1 ? index / (total - 1) : 0;
  if (role.key === "problem") s += (1 - pos) * 3;
  if (role.key === "gap") s += pos <= 0.5 ? 1 : -3;
  if (role.key === "did") s += pos > 0.1 && pos < 0.7 ? 1 : 0;
  if (role.key === "result") s += pos > 0.4 ? 1 : 0;
  if (role.key === "matters") s += pos * 3;
  return s;
}

/** Tidy one sentence for a bullet: drop connective openers, cap length. */
export function tidy(sentence, maxWords = 42) {
  let s = sentence.trim()
    .replace(/^(however|yet|but|moreover|furthermore|additionally|in addition|in this (paper|work)|to this end|to address (this|these)( issues?| challenges?| limitations?| gaps?)?|specifically|finally|overall|notably|thus|therefore)\s*,?\s*/i, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  const words = s.split(" ");
  if (words.length > maxWords) {
    s = words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "") + "…";
  }
  return s;
}

/**
 * Turn an abstract into exactly five labelled bullets (fewer only if the abstract
 * has fewer than five sentences). Each sentence is used once.
 */
export function fiveBullets(abstract) {
  const sents = splitSentences(abstract);
  if (!sents.length) return [];
  const used = new Set();
  const picked = {};
  // The opening sentence almost always sets up the problem, unless it is already "We ...".
  if (sents.length >= 5 && !/^(we|in this|this (paper|work))\b/i.test(sents[0])) {
    used.add(0); picked.problem = 0;
  }
  // Assign the most distinctive roles first so generic ones don't steal their sentence.
  for (const key of ["did", "result", "gap", "problem", "matters"]) {
    if (key in picked) continue;
    const role = ROLES.find((r) => r.key === key);
    let best = -1, bestScore = -Infinity;
    sents.forEach((s, i) => {
      if (used.has(i)) return;
      const sc = score(s, role, i, sents.length);
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    if (best >= 0) { used.add(best); picked[key] = best; }
  }
  return ORDER.filter((k) => k in picked).map((key) => ({
    key,
    label: ROLES.find((r) => r.key === key).label,
    text: tidy(sents[picked[key]]),
    index: picked[key],
  }));
}

/** Pick the paper of the day: most upvotes, then most comments, then lowest arXiv id. */
export function pickPaper(entries) {
  const list = (entries || []).filter((e) => e && e.paper && e.paper.id);
  list.sort((a, b) =>
    (b.paper.upvotes || 0) - (a.paper.upvotes || 0) ||
    (b.numComments || 0) - (a.numComments || 0) ||
    String(a.paper.id).localeCompare(String(b.paper.id)));
  return list;
}

/** YYYY-MM-DD in UTC. */
export function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** Default day to show: yesterday in UTC, so the upvotes have had a full day to settle. */
export function defaultDate(now = new Date()) {
  return shiftDate(isoDate(now), -1);
}

export function authorLine(authors, max = 4) {
  const names = (authors || []).map((a) => a.name).filter(Boolean);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} + ${names.length - max} more`;
}

/** Plain-text version for copying or sharing. */
export function asText(paper, bullets) {
  const lines = [paper.title, `https://arxiv.org/abs/${paper.id}`, ""];
  for (const b of bullets) lines.push(`• ${b.label}: ${b.text}`);
  return lines.join("\n");
}

/** Parse "- Label: text" lines from a model reply into bullets. */
export function parseModelBullets(reply) {
  const labels = ORDER.map((k) => ROLES.find((r) => r.key === k).label);
  const lines = String(reply || "").split("\n").map((l) => l.trim()).filter((l) => /^[-•*\d]/.test(l));
  return lines.slice(0, 5).map((l, i) => {
    const body = l.replace(/^([-•*]|\d+[.)])\s*/, "").replace(/\*\*/g, "");
    const m = body.match(/^([^:]{3,30}):\s*(.+)$/);
    return { key: ORDER[i], label: m ? m[1].trim() : labels[i], text: (m ? m[2] : body).trim() };
  });
}
