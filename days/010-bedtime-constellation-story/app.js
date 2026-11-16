// Bedtime Constellation Story: Day 10 of Ship 100.
// Plain ES module, no build step. Settings live in localStorage (wrapped in try/catch).
import { CONSTELLATIONS } from "./stories.js";
import {
  pickTonight, visibilityScore, compassWord, heightWords, sunAltitude, zonedInstant, ymdIn, dayIndexOf,
} from "./sky.js";

const CITIES = [
  ["Auckland", -36.85, 174.76, "Pacific/Auckland"], ["Bengaluru", 12.97, 77.59, "Asia/Kolkata"],
  ["Berlin", 52.52, 13.4, "Europe/Berlin"], ["Cairo", 30.04, 31.24, "Africa/Cairo"],
  ["Cape Town", -33.92, 18.42, "Africa/Johannesburg"], ["Chicago", 41.88, -87.63, "America/Chicago"],
  ["Delhi", 28.61, 77.21, "Asia/Kolkata"], ["Denver", 39.74, -104.99, "America/Denver"],
  ["Dubai", 25.2, 55.27, "Asia/Dubai"], ["London", 51.51, -0.13, "Europe/London"],
  ["Los Angeles", 34.05, -118.24, "America/Los_Angeles"], ["Mexico City", 19.43, -99.13, "America/Mexico_City"],
  ["Mumbai", 19.08, 72.88, "Asia/Kolkata"], ["Nairobi", -1.29, 36.82, "Africa/Nairobi"],
  ["New York", 40.71, -74.01, "America/New_York"], ["Paris", 48.86, 2.35, "Europe/Paris"],
  ["San Francisco", 37.77, -122.42, "America/Los_Angeles"], ["São Paulo", -23.55, -46.63, "America/Sao_Paulo"],
  ["Seattle", 47.61, -122.33, "America/Los_Angeles"], ["Singapore", 1.35, 103.82, "Asia/Singapore"],
  ["Sydney", -33.87, 151.21, "Australia/Sydney"], ["Tokyo", 35.68, 139.69, "Asia/Tokyo"],
  ["Toronto", 43.65, -79.38, "America/Toronto"],
];
const TIMES = ["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"];
const KEY = "ship100.bedtime-story.v1";
const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();

const $ = (s) => document.querySelector(s);
const els = {
  place: $("#place"), time: $("#time"), locate: $("#locate"), locNote: $("#loc-note"),
  sky: $("#sky"), look: $("#look"), title: $("#title"), nick: $("#nick"), find: $("#find"),
  story: $("#story"), read: $("#read"), another: $("#another"), also: $("#also"), alsoWrap: $("#also-wrap"),
  fact: $("#fact"), from: $("#from"), light: $("#light"), when: $("#when"), bigger: $("#bigger"),
};

let settings = load();
let current = null;     // { c, place }
let visible = [];       // well-placed constellations tonight, best first

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { s = {}; }
  const out = { city: null, here: null, time: "19:30", big: false };
  if (typeof s.city === "string" && CITIES.some((c) => c[0] === s.city)) out.city = s.city;
  if (s.here && Number.isFinite(s.here.lat) && Number.isFinite(s.here.lon)
      && Math.abs(s.here.lat) <= 90 && Math.abs(s.here.lon) <= 180) out.here = { lat: s.here.lat, lon: s.here.lon };
  if (TIMES.includes(s.time)) out.time = s.time;
  out.big = s.big === true;
  if (!out.city) out.city = guessCity();
  return out;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode: fine */ }
}
/** Default city: one in the device's time zone, else one with the same UTC offset right now, else New York. */
function guessCity() {
  const exact = CITIES.find((c) => c[3] === deviceTz);
  if (exact) return exact[0];
  const now = new Date();
  const offsetOf = (tz) => {
    const { y, m, d } = ymdIn(now, tz);
    return zonedInstant(y, m, d, 12, 0, tz).getTime() - Date.UTC(y, m - 1, d, 12, 0);
  };
  const mine = now.getTimezoneOffset() * 60000; // same sign as offsetOf(): ms the zone is behind UTC
  const same = CITIES.find((c) => { try { return offsetOf(c[3]) === mine; } catch { return false; } });
  return (same || CITIES.find((c) => c[0] === "New York"))[0];
}

function where() {
  if (settings.here) return { lat: settings.here.lat, lon: settings.here.lon, tz: deviceTz, label: "your location" };
  const c = CITIES.find((x) => x[0] === settings.city) || CITIES[0];
  return { lat: c[1], lon: c[2], tz: c[3], label: c[0] };
}

// ---------- Controls ----------
function fillControls() {
  els.place.innerHTML = "";
  if (settings.here) els.place.append(new Option("📍 My location", "__here"));
  for (const c of CITIES) els.place.append(new Option(c[0], c[0]));
  els.place.value = settings.here ? "__here" : settings.city;
  els.time.innerHTML = "";
  for (const t of TIMES) els.time.append(new Option(prettyTime(t), t));
  els.time.value = settings.time;
  document.body.classList.toggle("big", settings.big);
  els.bigger.setAttribute("aria-pressed", String(settings.big));
}
function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} pm`;
}

els.place.addEventListener("change", () => {
  if (els.place.value !== "__here") { settings.city = els.place.value; settings.here = null; els.locNote.textContent = ""; }
  save(); fillControls(); render();
});
els.time.addEventListener("change", () => { settings.time = els.time.value; save(); render(); });
els.bigger.addEventListener("click", () => { settings.big = !settings.big; save(); fillControls(); });
els.locate.addEventListener("click", () => {
  if (!("geolocation" in navigator)) { els.locNote.textContent = "This browser can't share a location. Pick a city instead."; return; }
  els.locNote.textContent = "Asking for your location…";
  navigator.geolocation.getCurrentPosition((pos) => {
    // Rounded to about 10 km: plenty for the sky, and nothing precise is kept.
    settings.here = { lat: Math.round(pos.coords.latitude * 10) / 10, lon: Math.round(pos.coords.longitude * 10) / 10 };
    els.locNote.textContent = "Using your location, rounded and kept on this device only.";
    save(); fillControls(); render();
  }, () => { els.locNote.textContent = "No location shared. That's fine: pick the nearest city."; },
  { maximumAge: 3600000, timeout: 10000 });
});
els.another.addEventListener("click", () => {
  if (visible.length < 2) return;
  const i = visible.findIndex((v) => v.c.id === current.c.id);
  stopReading();
  show(visible[(i + 1) % visible.length]);
  els.title.focus();
});

// ---------- Read aloud (Web Speech API, built into the browser) ----------
const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
if (!canSpeak) els.read.hidden = true;
els.read.addEventListener("click", () => {
  if (!canSpeak) return;
  if (speechSynthesis.speaking) { stopReading(); return; }
  const u = new SpeechSynthesisUtterance([`${current.c.nick}.`, ...current.c.story].join(" "));
  u.rate = 0.85; u.pitch = 1.05;
  const v = pickVoice(); if (v) u.voice = v;
  u.onend = u.onerror = () => setReading(false);
  speechSynthesis.cancel(); speechSynthesis.speak(u); setReading(true);
});
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  return voices.find((v) => /samantha|karen|moira|serena|female/i.test(v.name)) || voices[0] || null;
}
function stopReading() { if (canSpeak) { try { speechSynthesis.cancel(); } catch { /* ignore */ } } setReading(false); }
function setReading(on) {
  els.read.textContent = on ? "■ Stop reading" : "▶ Read it to me";
  els.read.setAttribute("aria-pressed", String(on));
}

// ---------- Render ----------
function render() {
  stopReading();
  const loc = where();
  const today = ymdIn(new Date(), loc.tz);
  const [hh, mm] = settings.time.split(":").map(Number);
  const at = zonedInstant(today.y, today.m, today.d, hh, mm, loc.tz);
  const { pick, visible: vis } = pickTonight(CONSTELLATIONS, at, loc.lat, loc.lon, dayIndexOf(today));
  // Tonight's pick first, then the rest best-placed first.
  visible = [pick, ...vis.filter((v) => v.c.id !== pick.c.id)];
  const dateWord = at.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: loc.tz || undefined });
  els.when.textContent = `${dateWord} · ${prettyTime(settings.time)} · ${loc.label}`;
  const sun = sunAltitude(at, loc.lat, loc.lon);
  els.light.hidden = sun < -6;
  els.light.textContent = sun > 0
    ? "The Sun is still up at this time, so the stars are hiding. Try a later bedtime, or save this story for a dark night."
    : "It's still twilight then, so only the brightest stars will show. Give the sky a little longer.";
  show(pick);
}

function show(entry) {
  current = entry;
  const { c, place } = entry;
  els.title.textContent = `${c.emoji} ${c.nick}`;
  els.nick.textContent = c.name === c.nick ? "" : `Its star name is ${c.name}.`;
  els.look.textContent = visibilityScore(place) > 0
    ? `Look ${compassWord(place.az)}, ${heightWords(place.alt)}.`
    : "It's low or hidden at this time tonight. This is how it looks right now.";
  els.find.textContent = c.find;
  els.story.replaceChildren(...c.story.map((t) => Object.assign(document.createElement("p"), { textContent: t })));
  els.fact.textContent = c.fact;
  els.from.textContent = c.from;
  drawSky(c, place);
  const others = visible.filter((v) => v.c.id !== c.id);
  els.alsoWrap.hidden = others.length === 0;
  els.another.hidden = others.length === 0;
  els.also.replaceChildren(...others.map((v) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.textContent = `${v.c.emoji} ${v.c.nick}`;
    b.addEventListener("click", () => {
      stopReading(); show(v);
      window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      els.title.focus({ preventScroll: true });
    });
    return b;
  }));
}

function drawSky(c, place) {
  const W = 340, H = 240, pad = 30;
  const xs = place.points.map((p) => p.x), ys = place.points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  // Keep the aspect ratio; don't blow up a long thin shape (like Crux's short bar) to fill both axes.
  const k = Math.min((W - 2 * pad) / Math.max(maxX - minX, span * 0.4), (H - 2 * pad) / Math.max(maxY - minY, span * 0.4));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const pts = place.points.map((p) => [W / 2 + (p.x - cx) * k, H / 2 - (p.y - cy) * k]);
  let bg = "", seed = hash(c.id);
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 55; i++) {
    bg += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${(0.4 + rnd()).toFixed(2)}" class="bgstar" style="animation-delay:${(i % 7) * 0.6}s"/>`;
  }
  const lines = c.lines.map(([a, b]) =>
    `<line x1="${pts[a][0].toFixed(1)}" y1="${pts[a][1].toFixed(1)}" x2="${pts[b][0].toFixed(1)}" y2="${pts[b][1].toFixed(1)}" pathLength="1"/>`).join("");
  const stars = c.stars.map((s, i) =>
    `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${Math.max(1.8, 6.2 - s[3] * 1.1).toFixed(1)}" class="star"><title>${s[0]}</title></circle>`).join("");
  const bi = c.stars.reduce((best, s, i) => (s[3] < c.stars[best][3] ? i : best), 0);
  const [lx, ly] = pts[bi];
  const end = lx > W - 100;
  const label = `<text x="${(lx + (end ? -10 : 10)).toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${end ? "end" : "start"}" class="label">${c.stars[bi][0]}</text>`;
  els.sky.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The stars of ${c.nick}, turned the way they look tonight">
    <g>${bg}</g><g class="lines">${lines}</g><g>${stars}</g>${label}</svg>`;
}
function hash(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff; return h || 1; }

fillControls();
render();
if (canSpeak) speechSynthesis.getVoices(); // some browsers load voices lazily
