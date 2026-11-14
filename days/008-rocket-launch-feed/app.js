// Rocket Launch Feed: Day 8 of Ship 100.
// Upcoming Vandenberg launches from Launch Library 2 (free, keyless, 15 requests an hour), cached for 30 minutes.
// For each launch, launch.js works out how it will look from your town. No build step, no keys, no tracking.

import * as A from "https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/esm/astronomy.js";
import { judge, hasTime, icsFor, trimLaunch, distanceKm, compass, bearingDeg } from "./launch.js";
import { CITIES, SPOTS } from "./spots.js";

const $ = (s) => document.querySelector(s);
const API = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?location__ids=11&limit=30&mode=normal";
const CACHE_KEY = "rocket-launch-feed:cache";
const CITY_KEY = "rocket-launch-feed:city";
const VIS_KEY = "rocket-launch-feed:visible-only";
const CACHE_MS = 30 * 60000;
const TZ = "America/Los_Angeles";

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const fmtMonth = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", year: "numeric" });
const fmtStamp = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const RATING = { great: "Great", good: "Good", fair: "Maybe", poor: "Unlikely", unknown: "TBD" };

let launches = [];
let from = CITIES.find((c) => c.id === store.get(CITY_KEY)) || CITIES.find((c) => c.id === "los-angeles");

// ---------- controls ----------
const citySel = $("#city");
citySel.innerHTML = CITIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("") + `<option value="here" hidden>My location</option>`;
citySel.value = from.id;
citySel.addEventListener("change", () => {
  const c = CITIES.find((x) => x.id === citySel.value);
  if (!c) return;
  from = c; store.set(CITY_KEY, c.id); render();
});

const visOnly = $("#visibleOnly");
visOnly.checked = !!store.get(VIS_KEY);
visOnly.addEventListener("change", () => { store.set(VIS_KEY, visOnly.checked); render(); });

$("#locate").addEventListener("click", () => {
  const btn = $("#locate");
  if (!navigator.geolocation) { btn.textContent = "Location not available"; return; }
  btn.disabled = true; btn.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(
    (p) => {
      // Your position stays in this tab: it is never stored or sent anywhere.
      from = { id: "here", name: "your location", lat: p.coords.latitude, lon: p.coords.longitude };
      const opt = citySel.querySelector('option[value="here"]');
      opt.hidden = false; citySel.value = "here";
      btn.disabled = false; btn.textContent = "Use my location";
      render();
    },
    () => { btn.disabled = false; btn.textContent = "Location blocked: pick a town"; },
    { timeout: 10000, maximumAge: 600000 },
  );
});

// ---------- data ----------
async function load() {
  const cached = store.get(CACHE_KEY);
  if (cached && Date.now() - cached.at < CACHE_MS && Array.isArray(cached.launches)) {
    return { launches: cached.launches, note: `Live data from Launch Library 2, fetched ${fmtStamp.format(new Date(cached.at))}.` };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(API, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(res.status === 429 ? "rate limited" : `HTTP ${res.status}`);
    const data = await res.json();
    const list = data.results.map(trimLaunch).filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon));
    store.set(CACHE_KEY, { at: Date.now(), launches: list });
    return { launches: list, note: `Live data from Launch Library 2, fetched ${fmtStamp.format(new Date())}.` };
  } catch (err) {
    const why = err.name === "AbortError" ? "timed out" : err.message;
    if (cached?.launches) return { launches: cached.launches, note: `Couldn't refresh (${why}). Showing the list from ${fmtStamp.format(new Date(cached.at))}.`, stale: true };
    const snap = await fetch("snapshot.json").then((r) => r.json());
    return { launches: snap.launches, note: `Couldn't reach Launch Library 2 (${why}). Showing a saved list from ${fmtStamp.format(new Date(snap.savedAt))}; times may have moved.`, stale: true };
  }
}

// ---------- render ----------
function when(l) {
  const d = new Date(l.net);
  switch (l.precision) {
    case "SEC": case "MIN": return `${fmtDay.format(d)} · ${fmtTime.format(d)}`;
    case "HR": return `${fmtDay.format(d)} · around ${fmtTime.format(d)}`;
    case "D": return `${fmtDay.format(d)} · time TBD`;
    case "M": return fmtMonth.format(d);
    default: return `No earlier than ${fmtMonth.format(d)}`;
  }
}

function lookLine(j) {
  const km = Math.round(j.distKm);
  if (km < 25) return `You're right next to the pad (${km} km).`;
  const up = j.kind === "night" ? j.flameEl : j.plumeEl;
  const what = j.kind === "night" ? "The flame" : "The plume";
  const height = up > 0.5 ? `${what} climbs to about ${Math.round(up)}° above the horizon (a fist at arm's length is about 10°).` : `${what} stays below your horizon.`;
  return `Look ${j.look} toward Vandenberg, ${km.toLocaleString()} km away. ${height}`;
}

function countdown(ms) {
  if (ms <= 0) return "Launch time passed: check the status";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `T−${d ? d + "d " : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function downloadIcs(l, j) {
  const extra = `${RATING[j.rating]} from ${from.name}: ${j.headline}. ${lookLine(j)}`;
  const blob = new Blob([icsFor(l, extra)], { type: "text/calendar" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${l.name.replace(/[^\w]+/g, "-").toLowerCase()}.ics` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const pill = (j) => `<span class="pill r-${j.rating}">${RATING[j.rating]}</span>`;
const statusPill = (l) => `<span class="status s-${esc(l.status.toLowerCase())}" title="${esc(l.statusName)}">${esc(l.status)}</span>`;

let tick = null;
function render() {
  const now = Date.now();
  const timed = launches.filter((l) => hasTime(l) && new Date(l.net).getTime() > now - 3 * 3600000)
    .sort((a, b) => new Date(a.net) - new Date(b.net));
  const tbd = launches.filter((l) => !hasTime(l));
  const judged = timed.map((l) => ({ l, j: judge(A, l, from) }));
  const shown = visOnly.checked ? judged.filter(({ j }) => ["great", "good", "fair"].includes(j.rating)) : judged;

  // Hero: the next launch with a set time that hasn't happened yet.
  const hero = judged.find(({ l }) => new Date(l.net).getTime() > now - 15 * 60000);
  const next = $("#next");
  clearInterval(tick);
  if (hero) {
    const { l, j } = hero;
    next.hidden = false;
    next.className = `card hero k-${j.kind}`;
    next.innerHTML = `
      <p class="eyebrow">Next launch ${statusPill(l)}</p>
      <h2 class="hero-name">${esc(l.mission || l.name)}</h2>
      <p class="muted">${esc(l.rocket)} · ${esc(l.provider)} · ${esc(l.pad)}</p>
      <p class="when">${esc(when(l))}</p>
      <p class="count" id="count">${countdown(new Date(l.net) - now)}</p>
      <div class="verdict">
        ${pill(j)}
        <div><b>${esc(j.headline)}</b> from ${esc(from.name)}<br><span class="muted">${esc(j.tip)}</span></div>
      </div>
      <p class="look">${esc(lookLine(j))}</p>
      <div class="actions">
        <button class="primary" id="heroIcs" type="button">Add to calendar</button>
        <a class="btn" href="#spots-h">Where to watch</a>
      </div>`;
    $("#heroIcs").addEventListener("click", () => downloadIcs(l, j));
    tick = setInterval(() => { const el = $("#count"); if (el) el.textContent = countdown(new Date(l.net) - Date.now()); }, 1000);
  } else {
    next.hidden = true;
  }

  const list = $("#list");
  list.innerHTML = shown.length ? shown.map(({ l, j }, i) => `
    <li class="launch card">
      <div class="row">
        <div class="date"><b>${esc(fmtDay.format(new Date(l.net)))}</b><span>${esc(fmtTime.format(new Date(l.net)))}${l.precision === "HR" ? " (approx.)" : ""}</span></div>
        <div class="what">
          <span><b>${esc(l.mission || l.name)}</b> ${statusPill(l)}</span>
          <span class="muted">${esc(l.rocket)}${l.orbit ? " · " + esc(l.orbit) : ""}</span>
          <span class="verdict-line">${pill(j)} ${esc(j.headline)}</span>
        </div>
      </div>
      <details>
        <summary>Details</summary>
        <p>${esc(j.tip)}</p>
        <p>${esc(lookLine(j))}</p>
        ${l.description ? `<p class="muted">${esc(l.description)}</p>` : ""}
        <p class="muted small">${esc(l.provider)} · ${esc(l.pad)}, ${esc(l.location)} · window ${esc(fmtTime.format(new Date(l.windowStart)))} to ${esc(fmtTime.format(new Date(l.windowEnd)))}</p>
        <button type="button" data-ics="${i}">Add to calendar</button>
      </details>
    </li>`).join("") : `<li class="card muted">${visOnly.checked ? `None of the launches with a set time look visible from ${esc(from.name)}. Untick "Only ones I can see" to see them all.` : "No launches with a set time right now."}</li>`;
  list.querySelectorAll("[data-ics]").forEach((b) => b.addEventListener("click", () => { const { l, j } = shown[Number(b.dataset.ics)]; downloadIcs(l, j); }));

  $("#tbdWrap").hidden = !tbd.length;
  $("#tbdCount").textContent = tbd.length;
  $("#tbd").innerHTML = tbd.map((l) => `<li><b>${esc(l.mission || l.name)}</b> <span class="muted">${esc(l.rocket)} · ${esc(when(l))}</span></li>`).join("");

  // Viewing spots, nearest to you first.
  const pad = timed[0] || launches[0] || { lat: 34.632, lon: -120.611 };
  const spots = SPOTS.map((s) => ({ ...s, you: distanceKm(from.lat, from.lon, s.lat, s.lon), toPad: distanceKm(s.lat, s.lon, pad.lat, pad.lon), dir: compass(bearingDeg(s.lat, s.lon, pad.lat, pad.lon)) }))
    .sort((a, b) => a.you - b.you);
  $("#spots").innerHTML = spots.map((s) => `
    <li class="spot card">
      <div class="spot-top">
        <b>${esc(s.name)}</b>
        <span class="tag t-${s.best}">${s.best === "close" ? "Close-up" : "Twilight"}</span>
      </div>
      <span class="muted small">${esc(s.area)} · ${Math.round(s.you).toLocaleString()} km from ${esc(from.name)} · pad is ${Math.round(s.toPad)} km ${s.dir}</span>
      <p>${esc(s.note)}</p>
      <a href="https://www.openstreetmap.org/?mlat=${s.lat}&amp;mlon=${s.lon}#map=14/${s.lat}/${s.lon}" target="_blank" rel="noopener">Open map</a>
    </li>`).join("");
}

load().then(({ launches: list, note, stale }) => {
  launches = list;
  const src = $("#source");
  src.textContent = note;
  src.classList.toggle("warn", !!stale);
  render();
}).catch((err) => {
  $("#source").textContent = `Couldn't load launches: ${err.message}`;
  $("#source").classList.add("warn");
});
