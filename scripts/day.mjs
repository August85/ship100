#!/usr/bin/env node
// Daily helper for Ship 100. Every state change to data/projects.json goes through here.
//
//   node scripts/day.mjs status          what today's run should do (JSON)
//   node scripts/day.mjs start           pick today's item, mark it building, scaffold days/NNN-slug/
//   node scripts/day.mjs ship <id>       mark shipped and fill in links
//   node scripts/day.mjs block <id> "why"  give up on today's item; it goes back in the queue as blocked
//   node scripts/day.mjs scaffold <id>   (re)create the folder only
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = path.join(ROOT, "data/projects.json");
const C = path.join(ROOT, "data/config.json");
const PAGES = "https://august85.github.io/ship100/";
const CODE = "https://github.com/August85/ship100/tree/main/";
const PLATFORM = { web: "Web app", ios: "iPhone app", garmin: "Garmin watch app", pi: "Raspberry Pi project" };

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n");
const cfg = readJson(C);
const db = readJson(P);
const tz = cfg.timezone || "America/Los_Angeles";
const localDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: tz });
const out = (o) => console.log(JSON.stringify(o, null, 2));
const die = (msg, extra = {}) => { out({ ok: false, error: msg, ...extra }); process.exit(1); };

const byOrder = (a, b) => a.order - b.order;
const shipped = () => db.items.filter((i) => i.status === "shipped");
const dirFor = (i) => `days/${String(i.day).padStart(3, "0")}-${i.slug}`;
const find = (id) => db.items.find((i) => i.id === id) || die(`no item ${id}`);

function pick() {
  const building = db.items.find((i) => i.status === "building");
  if (building) return { item: building, resumed: true };
  const approved = db.items.filter((i) => i.status === "approved").sort(byOrder);
  if (approved.length) return { item: approved[0], resumed: false };
  if (cfg.autoPickUnreviewed === false) return { item: null };
  return { item: db.items.filter((i) => i.status === "idea").sort(byOrder)[0] || null, resumed: false };
}

function status() {
  const today = localDate();
  const doneToday = shipped().find((i) => (i.shippedAt || "").slice(0, 10) === today);
  const { item, resumed } = pick();
  let action = "build", reason = "";
  if (!cfg.started) { action = "stop"; reason = "Not started yet. Press Start on the tracker page."; }
  else if (cfg.paused) { action = "stop"; reason = "Paused on the tracker page."; }
  else if (shipped().length >= 100) { action = "stop"; reason = "All 100 shipped."; }
  else if (doneToday) { action = "stop"; reason = `Already shipped today: ${doneToday.title}.`; }
  else if (!item) { action = "stop"; reason = "Nothing left in the queue (no approved or unreviewed ideas)."; }
  return { ok: true, today, action, reason, resumed: !!resumed, shippedCount: shipped().length, next: item };
}

// ---------- Scaffolding ----------
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escStr = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
function vars(i) {
  const words = i.title.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/);
  return {
    TITLE: i.title, SUMMARY: i.summary, DAY: String(i.day), DIR: path.basename(dirFor(i)), SLUG: i.slug,
    PLATFORM: PLATFORM[i.stack] || i.stack,
    XC_NAME: words.map((w) => w[0].toUpperCase() + w.slice(1)).join("").replace(/^\d+/, "") || "App",
    XC_ID: i.slug.replace(/[^a-z0-9]/g, ""),
    APP_ID: crypto.randomBytes(16).toString("hex"),
  };
}
function fill(text, file, v) {
  const ext = path.extname(file);
  const enc = [".html", ".xml"].includes(ext) ? escHtml : [".swift", ".yml", ".py", ".js", ".mc"].includes(ext) ? escStr : (s) => s;
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in v ? enc(v[k]) : m));
}
function copyTemplate(name, dest, v) {
  const src = path.join(ROOT, "templates", name);
  for (const ent of fs.readdirSync(src, { withFileTypes: true, recursive: true })) {
    if (!ent.isFile()) continue;
    const from = path.join(ent.parentPath ?? ent.path, ent.name);
    const to = path.join(dest, path.relative(src, from));
    if (fs.existsSync(to)) continue; // never clobber work in progress
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const isText = /\.(html|css|js|mjs|json|md|py|swift|yml|yaml|xml|mc|jungle|service|txt)$/.test(from);
    isText ? fs.writeFileSync(to, fill(fs.readFileSync(from, "utf8"), to, v)) : fs.copyFileSync(from, to);
  }
}
function scaffold(i) {
  const dir = path.join(ROOT, dirFor(i));
  const v = vars(i);
  fs.mkdirSync(dir, { recursive: true });
  if (i.stack === "web") {
    copyTemplate("web", dir, v);
  } else {
    // Native days: a landing page at the folder root (what Pages serves) + the app in app/.
    copyTemplate("landing", dir, v);
    fs.copyFileSync(path.join(ROOT, "templates/web/style.css"), path.join(dir, "style.css"));
    copyTemplate(i.stack, path.join(dir, "app"), v);
    fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
  }
  const readme = path.join(dir, "README.md");
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, `# ${i.title}\n\nDay ${i.day} of [Ship 100](${PAGES}). ${PLATFORM[i.stack]}.\n\n${i.summary}\n\n## Run it\n\nTODO\n`);
  return dirFor(i);
}

// ---------- Commands ----------
const [cmd, id, ...rest] = process.argv.slice(2);
if (cmd === "status" || !cmd) out(status());
else if (cmd === "start") {
  const s = status();
  if (s.action !== "build") die(s.reason, { action: "stop" });
  const i = s.next;
  if (!s.resumed) { i.status = "building"; i.day = shipped().length + 1; }
  writeJson(P, db);
  out({ ok: true, resumed: s.resumed, item: i, dir: scaffold(i) });
} else if (cmd === "scaffold") {
  const i = find(id); if (!i.day) die("item has no day yet; use start");
  out({ ok: true, dir: scaffold(i) });
} else if (cmd === "ship") {
  const i = find(id);
  if (i.status !== "building") die(`item is ${i.status}, not building`);
  const dir = dirFor(i);
  if (!fs.existsSync(path.join(ROOT, dir, "index.html"))) die(`${dir}/index.html is missing`);
  i.status = "shipped"; i.shippedAt = new Date().toISOString();
  i.links = { ...i.links, live: `${PAGES}${dir}/`, code: `${CODE}${dir}` };
  writeJson(P, db);
  out({ ok: true, item: i });
} else if (cmd === "block") {
  const i = find(id);
  const why = rest.join(" ").trim() || "unspecified";
  i.status = "blocked"; i.notes = `${i.notes ? i.notes + "\n" : ""}[${localDate()}] Blocked: ${why}`;
  const keepDay = i.day; i.day = null;
  writeJson(P, db);
  out({ ok: true, item: i, abandonedDir: keepDay ? `days/${String(keepDay).padStart(3, "0")}-${i.slug}` : null });
} else die(`unknown command ${cmd}`);
