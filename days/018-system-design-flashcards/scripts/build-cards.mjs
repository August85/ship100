// Builds cards.json from the LevelUP library (read-only).
// Usage: node scripts/build-cards.mjs [path/to/levelup/app/data/library.json]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || "/Users/august/code/levelup/app/data/library.json";
const L = JSON.parse(readFileSync(src, "utf8"));

const ALLOWED = new Set(["p", "b", "strong", "em", "i", "code", "ul", "ol", "li", "br", "pre", "blockquote"]);
// Keep a small set of inline/list tags, drop attributes and everything else.
export function clean(html = "") {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (m, tag) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.has(t)) return "";
      return m.startsWith("</") ? `</${t}>` : `<${t}>`;
    })
    .replace(/\n{2,}/g, "\n")
    .trim();
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const decks = [];
const seen = new Set();
const uid = (id) => { let u = id, i = 2; while (seen.has(u)) u = `${id}-${i++}`; seen.add(u); return u; };

for (const d of L.practice) {
  decks.push({
    id: d.id, title: d.title, group: "Interview practice", summary: d.summary || "",
    cards: d.cards.map((c) => ({ id: uid(c.id), q: c.q, a: clean(c.a) })),
  });
}

for (const cat of L.principleCatalog) {
  decks.push({
    id: "pc-" + slug(cat.title), title: cat.title, group: "Design principles", summary: "Name the principle, then say what it claims.",
    cards: cat.items.map((p) => ({ id: uid(p.id), q: `${p.name}: what does it say?`, a: `<p>${esc(p.summary)}</p>` })),
  });
}

const byVol = new Map();
for (const p of L.principles) {
  if (!byVol.has(p.vol)) byVol.set(p.vol, { title: p.volTitle, items: [] });
  byVol.get(p.vol).items.push(p);
}
for (const [vol, v] of [...byVol].sort((a, b) => a[0] - b[0])) {
  decks.push({
    id: `vol-${vol}`, title: `Vol ${vol} · ${v.title}`, group: "Volume principles", summary: `Design principles from Volume ${vol}.`,
    cards: v.items.map((p) => ({ id: uid(`v${vol}-${slug(p.name)}`), q: `${p.name}: why?`, a: `<p>${clean(p.html || esc(p.body))}</p>` })),
  });
}

for (const g of L.algorithms) {
  decks.push({
    id: "alg-" + slug(g.title), title: g.title, group: "Algorithms", summary: "What problem does it solve?",
    cards: g.items.map((a) => ({ id: uid(a.id), q: `${a.name}: what problem does it solve?`, a: `<p>${esc(a.summary)}</p>` })),
  });
}

const out = {
  source: "LevelUP · Distinguished Engineer Knowledge Library (github.com/August85/levelup)",
  builtAt: new Date().toISOString().slice(0, 10),
  volumes: L.volumes.map((v) => ({ n: v.n, title: v.title, part: v.part })),
  decks,
};
writeFileSync(join(here, "..", "cards.json"), JSON.stringify(out));
console.log(decks.length, "decks,", decks.reduce((n, d) => n + d.cards.length, 0), "cards");
