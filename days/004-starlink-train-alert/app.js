// Starlink Train Alert: Day 4 of Ship 100.
// Finds fresh Starlink "trains" (newly launched satellites still flying in a line), works out when one
// is visible from a ZIP code or city, and gives each pass a calendar reminder.
// Orbit math in orbit.js (from Day 3, ported from SatellitePaglu); train logic in train.js.
// No build step, no keys, no tracking.

import { parseOMM, compassPoint } from "./orbit.js";
import { analyzeLaunches, trainPasses, demoTLEs } from "./train.js";

const $ = (s) => document.querySelector(s);
const PLACE_KEY = "starlink-train:place";
const DATA_KEY = "starlink-train:omm";
const DAYS = 5;
const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=json";
const SELF = "https://august85.github.io/ship100/days/004-starlink-train-alert/";

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or full: fine */ } },
};

const state = { omm: [], tles: [], source: "", fetchedAt: 0, launches: [], place: null, clouds: null, demo: false, passes: [], shown: null };

// ---------- orbit data ----------
const onlyStarlink = (arr) => (Array.isArray(arr) ? arr.filter((o) => /^STARLINK/i.test(o?.OBJECT_NAME || "")) : []);

async function loadData() {
  const cached = store.get(DATA_KEY);
  // CelesTrak refuses repeat downloads of the same data within two hours, so reuse a fresh copy.
  if (cached?.omm?.length && Date.now() - cached.at < 2 * 3600e3) return { omm: cached.omm, source: "CelesTrak", at: cached.at };
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(CELESTRAK, { signal: ctl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error("http " + res.status);
    const omm = onlyStarlink(await res.json());
    if (!omm.length) throw new Error("no starlink");
    const at = Date.now();
    store.set(DATA_KEY, { omm, at });
    return { omm, source: "CelesTrak", at };
  } catch {
    if (cached?.omm?.length) return { omm: cached.omm, source: "CelesTrak (saved copy)", at: cached.at };
    const omm = onlyStarlink(await (await fetch("starlink-recent.json")).json());
    const newest = Math.max(...omm.map((o) => Date.parse(o.EPOCH + "Z")));
    return { omm, source: "a snapshot bundled with this page", at: newest };
  }
}

// ---------- formatting ----------
const tzOf = () => state.place?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmt = (ms, opts) => new Intl.DateTimeFormat(undefined, { timeZone: tzOf(), ...opts }).format(ms);
const timeStr = (ms) => fmt(ms, { hour: "numeric", minute: "2-digit" });
const dateKey = (ms) => fmt(ms, { year: "numeric", month: "2-digit", day: "2-digit" });
const hourIn = (ms) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tzOf(), hour: "2-digit", hourCycle: "h23" }).format(ms));
const longDate = (ms) => fmt(ms, { weekday: "short", month: "short", day: "numeric" });
const shortDate = (ms) => fmt(ms, { month: "short", day: "numeric" });

function dayLabel(ms) {
  const h = hourIn(ms);
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  if (dateKey(ms) === dateKey(Date.now())) return part === "evening" ? "Tonight" : `This ${part}`;
  if (dateKey(ms) === dateKey(Date.now() + 86400e3)) return `Tomorrow ${part}`;
  return fmt(ms, { weekday: "long" }) + " " + part;
}

function countdown(ms) {
  let s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `in ${d}d ${h}h ${m}m`;
  if (h) return `in ${h}h ${m}m`;
  return `in ${m}m ${String(s).padStart(2, "0")}s`;
}

const dir = (az) => `the ${compassPoint(az)}`;
const up = (el) => (el < 3 ? "low on the horizon" : `${Math.round(el)}° up`);
function fists(el) {
  if (el >= 80) return "nearly straight overhead";
  const n = Math.max(1, Math.round(el / 10));
  return `about ${n} fist${n > 1 ? "s" : ""} above the horizon`;
}
function brightness(mag) {
  if (mag <= 2.5) return { n: 4, label: "Bright" };
  if (mag <= 4) return { n: 3, label: "Easy to see" };
  if (mag <= 5) return { n: 2, label: "Faint, needs a darker sky" };
  return { n: 1, label: "Very faint" };
}
const dots = (n) => `<span class="bright" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mins = (p) => Math.max(1, Math.round((p.end - p.start) / 60e3));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const ago = (days) => (days < 1 ? "less than a day ago" : `${plural(Math.round(days), "day")} ago`);

function cloudFor(ms) {
  const c = state.clouds;
  if (!c) return null;
  const i = c.times.findIndex((t) => Math.abs(t - ms) <= 1800e3);
  if (i < 0 || !Number.isFinite(c.cover[i])) return null;
  const v = c.cover[i];
  return { v, label: v < 25 ? "Clear" : v < 60 ? "Partly cloudy" : "Cloudy" };
}

// ---------- pictures ----------
// Where each satellite of a launch sits around its orbit. A train shows as a tight gold clump.
function ringSVG(l) {
  const C = 32, R = 24;
  const inArc = new Set(l.arcAngles);
  const strong = l.status !== "spread";
  const pts = l.angles.map((u) => {
    const a = (u * Math.PI) / 180;
    const on = strong && inArc.has(u);
    return `<circle class="${on ? "on" : ""}" cx="${(C + R * Math.sin(a)).toFixed(1)}" cy="${(C - R * Math.cos(a)).toFixed(1)}" r="${on ? 3.2 : 2.6}"/>`;
  }).join("");
  return `<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="orbit" cx="${C}" cy="${C}" r="${R}"/><circle class="earth" cx="${C}" cy="${C}" r="11"/>${pts}</svg>`;
}

function domeSVG(p) {
  const R = 100, C = 120;
  const pt = (az, el) => {
    const r = ((90 - Math.max(0, el)) / 90) * R, a = (az * Math.PI) / 180;
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  };
  const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const v = p.trackVisible;
  const all = p.track.map((s) => pt(s.azimuth, s.elevation));
  const vis = [pt(v.startAz, v.startEl),
    ...p.track.filter((s) => s.ms > v.start && s.ms < v.end).map((s) => pt(s.azimuth, s.elevation)),
    pt(v.endAz, v.endEl)];
  // A few dots along the visible path stand for the train.
  const beads = vis.filter((_, i) => i % Math.max(1, Math.floor(vis.length / 9)) === 0).slice(0, 9)
    .map(([x, y]) => `<circle class="bead" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`).join("");
  const [sx, sy] = vis[0];
  return `<svg class="dome" viewBox="0 0 240 240" role="img" aria-label="Sky map, north at the top: the train's path from ${compassPoint(p.startAz)} to ${compassPoint(p.endAz)}, highest ${Math.round(p.peak.elevation)} degrees">
    <defs><radialGradient id="skygrad"><stop offset="0" stop-color="#1e3a6a"/><stop offset="1" stop-color="#0b1026"/></radialGradient></defs>
    <circle class="bg" cx="${C}" cy="${C}" r="${R + 14}"/>
    <circle class="ring" cx="${C}" cy="${C}" r="${R}"/><circle class="ring" cx="${C}" cy="${C}" r="${(R * 60) / 90}"/><circle class="ring" cx="${C}" cy="${C}" r="${(R * 30) / 90}"/>
    <text class="lbl" x="${C}" y="${C - R - 7}">N</text><text class="lbl" x="${C + R + 7}" y="${C}">E</text>
    <text class="lbl" x="${C}" y="${C + R + 7}">S</text><text class="lbl" x="${C - R - 7}" y="${C}">W</text>
    <path class="trk" d="${path(all)}"/>
    <path class="vis" d="${path(vis)}"/>
    ${beads}
    <circle class="dot" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"/>
  </svg>`;
}

// ---------- reminders ----------
function summaryLines(p) {
  return [
    `${timeStr(p.start)}: the first satellites appear in ${dir(p.startAz)}, ${up(p.startEl)}.`,
    `${timeStr(p.peak.ms)}: highest, ${Math.round(p.peak.elevation)}° up in ${dir(p.peak.azimuth)}.`,
    `${timeStr(p.end)}: the last ones ${p.fadesInShadow ? "fade out" : "set"} in ${dir(p.endAz)}.`,
    `${brightness(p.magnitude).label} (estimate). A line of steady, moving dots with no blinking lights.`,
  ];
}

function icsFor(p) {
  const z = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const escI = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const desc = [...summaryLines(p), "Times can shift by a few minutes; check again that afternoon:", SELF].join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ship 100//Starlink Train Alert//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:starlink-${p.launch.id}-${z(p.start)}-${state.place.lat.toFixed(2)}-${state.place.lon.toFixed(2)}@ship100`,
    `DTSTAMP:${z(Date.now())}`,
    `DTSTART:${z(p.start - 2 * 60e3)}`,
    `DTEND:${z(p.end + 2 * 60e3)}`,
    `SUMMARY:${escI(`${p.launch.id.startsWith("DEMO") ? "DEMO, not real: " : ""}Starlink train: look ${compassPoint(p.startAz)}, up to ${Math.round(p.peak.elevation)}°`)}`,
    `DESCRIPTION:${escI(desc)}`,
    `LOCATION:${escI(state.place.name)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Starlink train in 15 minutes", "TRIGGER:-PT15M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  const fold = (l) => l.match(/.{1,60}/gu).join("\r\n ");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function downloadICS(p) {
  const blob = new Blob([icsFor(p)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `starlink-train-${new Date(p.start).toISOString().slice(0, 16).replace(/[-:T]/g, "")}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function mailtoFor(p) {
  const subject = `${p.launch.id.startsWith("DEMO") ? "DEMO, not real: " : ""}Starlink train ${dayLabel(p.start).toLowerCase()}, ${timeStr(p.start)}`;
  const body = [`${longDate(p.start)} from ${state.place.name}:`, "", ...summaryLines(p), "", `Check again before you go out: ${SELF}`].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- rendering ----------
const isGood = (p) => p.peak.elevation >= 15 && p.magnitude <= 5;
const upcoming = () => state.passes.filter((p) => p.end > Date.now());
const visibleLaunches = () => (state.demo ? state.demoLaunches : state.launches.filter((l) => l.status !== "spread"));

function launchLine(l) {
  const what = l.status === "train"
    ? `<b>Train</b>: ${l.inTrain} of ${l.count} satellites in a line about ${Math.max(1, Math.round(l.lengthMin))} min long`
    : l.status === "loose"
      ? `<b>Loose string</b>: ${l.inTrain} of ${l.count} still bunched up, the rest spread out`
      : `<b>Spread out</b>: no train left, just single satellites`;
  return `<li class="launch ${l.status}">${ringSVG(l)}<div>
    <div class="lt">${l.id.startsWith("DEMO") ? "Demo launch (made up)" : `Launch ${esc(l.id)}`} <span class="muted">· ${esc(shortDate(l.launchedMs))}, ${ago(l.ageDays)}</span></div>
    <div class="ls">${what}. About ${Math.round(l.altKm)} km up.</div></div></li>`;
}

function renderStatus() {
  const el = $("#status");
  const real = state.launches;
  const trains = real.filter((l) => l.status === "train"), loose = real.filter((l) => l.status === "loose");
  let head, text;
  if (state.demo) {
    head = "Demo: a made-up fresh train";
    text = "This is what the page shows a day or two after a launch. The train below is invented from a real satellite's orbit, so the times are not real.";
  } else if (trains.length) {
    head = trains.length > 1 ? `${trains.length} fresh Starlink trains are up` : "A fresh Starlink train is up";
    text = state.place ? "Here's when you can see it from your place." : "Enter your ZIP code to see when it passes over you.";
  } else if (loose.length) {
    head = "No tight train, but a loose string is still up";
    text = "Some satellites from a recent launch are still bunched together. It won't look like a neat line, but it's worth a look on a clear evening.";
  } else {
    const newest = real[0];
    head = "No fresh Starlink train right now";
    text = newest
      ? `The newest launch went up ${ago(newest.ageDays)} and its satellites have already spread out. New batches go up every week or two, so check back after the next launch.`
      : "There were no Starlink launches in the last 30 days.";
  }
  const list = (state.demo ? [...state.demoLaunches, ...real] : real).slice(0, 6);
  el.innerHTML = `
    <p class="kicker">Recent Starlink launches</p>
    <p class="headline">${esc(head)}</p>
    <p class="muted">${esc(text)}</p>
    ${list.length ? `<ul class="launches">${list.map(launchLine).join("")}</ul>` : ""}
    <div class="actions">${state.demo
      ? `<button type="button" id="demo-off">Back to real data</button>`
      : !trains.length && !loose.length ? `<button type="button" id="demo-on">Show a demo train</button>` : ""}</div>`;
  $("#demo-on")?.addEventListener("click", () => setDemo(true));
  $("#demo-off")?.addEventListener("click", () => setDemo(false));
}

function renderNext() {
  const el = $("#next");
  const list = upcoming();
  const pass = list.find(isGood) || list[0];
  state.shown = pass || null;
  if (!state.place || !visibleLaunches().length) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle("demo", state.demo);
  if (!pass) {
    el.innerHTML = `<div><p class="kicker">Next visible train</p><p class="when">None in the next ${DAYS} days</p>
      <p class="muted">The train is up, but its orbit doesn't cross your dark sky while it's still sunlit this week. Trains are only visible near dusk and dawn.</p></div>`;
    return;
  }
  const b = brightness(pass.magnitude);
  const live = Date.now() >= pass.start;
  const cloud = cloudFor(pass.start);
  const step = (ms, html) => `<li><span class="t">${esc(timeStr(ms))}</span><span>${html}</span></li>`;
  el.innerHTML = `
    <div>
      ${state.demo ? `<p class="badge">Demo, not a real prediction</p>` : ""}
      <p class="kicker">${live ? "Visible right now" : `Next visible train · ${esc(longDate(pass.start))}`}</p>
      <p class="when">${live ? "Look up!" : `${esc(dayLabel(pass.start))}, ${esc(timeStr(pass.start))}`}</p>
      <p class="countdown" id="cd">${live ? `ends ${countdown(pass.end)}` : countdown(pass.start)}</p>
      <ol class="steps">
        ${step(pass.start, `First satellites appear in <b>${dir(pass.startAz)}</b>, ${up(pass.startEl)}`)}
        ${step(pass.peak.ms, `Highest: <b>${Math.round(pass.peak.elevation)}° up</b> in ${dir(pass.peak.azimuth)}, ${fists(pass.peak.elevation)}`)}
        ${step(pass.end, `Last ones ${pass.fadesInShadow ? "fade into Earth's shadow" : "set"} in <b>${dir(pass.endAz)}</b>`)}
      </ol>
      <div class="meta">
        <span>About ${plural(mins(pass), "minute")}${pass.whole ? "" : ", only part of the train"}</span>
        <span>${dots(b.n)} ${b.label}</span>
        ${cloud ? `<span>${cloud.label} (${Math.round(cloud.v)}% cloud)</span>` : ""}
      </div>
      <div class="actions">
        <button class="primary" type="button" data-ics>Remind me (.ics)</button>
        <a class="btn" href="${mailtoFor(pass)}">Email this to myself</a>
      </div>
    </div>
    <div class="dome-wrap">${domeSVG(pass)}</div>`;
  el.querySelector("[data-ics]").addEventListener("click", () => downloadICS(pass));
}

function renderList() {
  const wrap = $("#list-wrap"), ol = $("#list");
  const list = upcoming();
  wrap.hidden = !state.place || list.length < 2;
  ol.innerHTML = "";
  for (const p of list) {
    const b = brightness(p.magnitude), cloud = cloudFor(p.start);
    const li = document.createElement("li");
    li.className = "pass" + (isGood(p) ? "" : " low");
    li.innerHTML = `
      <div class="d">${esc(longDate(p.start))}, ${esc(timeStr(p.start))}<span class="rel">${esc(dayLabel(p.start))}</span></div>
      <div class="r">${dots(b.n)}<span class="sr-only">${b.label}</span>
        <button type="button" aria-label="Add the ${esc(longDate(p.start))} ${esc(timeStr(p.start))} train to your calendar">.ics</button></div>
      <div class="s">${compassPoint(p.startAz)} → ${compassPoint(p.endAz)} · up to ${Math.round(p.peak.elevation)}° · ${plural(mins(p), "min")}${cloud ? ` · ${cloud.label.toLowerCase()}` : ""}${isGood(p) ? "" : " · low or faint"}</div>`;
    li.querySelector("button").addEventListener("click", () => downloadICS(p));
    ol.append(li);
  }
}

function renderNote() {
  const age = Math.max(0, (Date.now() - state.fetchedAt) / 3600e3);
  const ageText = age < 1 ? "less than an hour" : age < 48 ? plural(Math.round(age), "hour") : plural(Math.round(age / 24), "day");
  $("#data-note").textContent =
    `Orbits of every satellite launched in the last 30 days, from ${state.source}, ${ageText} old. ` +
    `Times are for ${tzOf().replace(/_/g, " ")}. New satellites keep changing their orbits, so passes more than a day or two out can move by several minutes. Brightness is an estimate.` +
    (age > 72 ? " This data is old: reload the page when you're online." : "");
}

function compute() {
  state.passes = [];
  if (state.place) {
    const obs = { latitude: state.place.lat, longitude: state.place.lon, altitude: 0 };
    const start = Date.now() - 10 * 60e3;
    if (state.demo && !state.demoLaunches) state.demoLaunches = analyzeLaunches(demoTLEs(state.tles, obs, start, DAYS), Date.now());
    for (const l of visibleLaunches()) {
      for (const p of trainPasses(l, obs, start, DAYS)) state.passes.push({ ...p, launch: l });
    }
    state.passes.sort((a, b) => a.start - b.start);
  } else if (state.demo && !state.demoLaunches) {
    state.demoLaunches = analyzeLaunches(demoTLEs(state.tles), Date.now());
  }
  renderStatus();
  renderNext();
  renderList();
  renderNote();
}

function setDemo(on) {
  state.demo = on;
  state.demoLaunches = null;
  try { history.replaceState(null, "", on ? "?demo" : location.pathname); } catch { /* fine */ }
  compute();
  if (on && !state.place) $("#place-msg").textContent = "Enter a ZIP code or city to see the demo train's passes.";
  (on ? $("#next") : $("#status")).scrollIntoView({ behavior: "smooth", block: "start" });
}

function tick() {
  const s = state.shown;
  if (!s) return;
  const now = Date.now();
  if (now > s.end) { compute(); return; }
  const cd = $("#cd");
  if (cd) cd.textContent = now >= s.start ? `ends ${countdown(s.end)}` : countdown(s.start);
}

// ---------- place ----------
async function loadClouds(place) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(3)}&longitude=${place.lon.toFixed(3)}&hourly=cloud_cover&forecast_days=7&timezone=auto&timeformat=unixtime`;
    const j = await (await fetch(url)).json();
    if (state.place !== place) return;
    state.clouds = { times: (j.hourly?.time || []).map((t) => t * 1000), cover: j.hourly?.cloud_cover || [] };
    if (!place.tz && j.timezone) { place.tz = j.timezone; store.set(PLACE_KEY, place); }
    compute();
  } catch { /* clouds are a nice extra */ }
}

function setPlace(place) {
  state.place = place;
  state.clouds = null;
  state.demoLaunches = null;
  store.set(PLACE_KEY, place);
  $("#place-name").textContent = place.name;
  $("#results").hidden = true;
  $("#q").value = "";
  $("#place-msg").textContent = "Your location stays in this browser.";
  compute();
  loadClouds(place);
}

async function lookupZip(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) return [];
  const j = await res.json();
  return (j.places || []).slice(0, 1).map((p) => ({
    label: `${zip} · ${p["place name"]}, ${p["state abbreviation"]}`, lat: Number(p.latitude), lon: Number(p.longitude), tz: "",
  }));
}

async function lookupCity(q) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  const hits = (await res.json()).results || [];
  return hits.map((h) => ({
    label: [h.name, h.admin1, h.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", "),
    lat: h.latitude, lon: h.longitude, tz: h.timezone,
  }));
}

$("#search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  const ul = $("#results"), msg = $("#place-msg");
  if (q.length < 2) return;
  msg.textContent = "Looking it up…";
  try {
    const zip = q.match(/^(\d{5})(-\d{4})?$/);
    const hits = zip ? await lookupZip(zip[1]) : await lookupCity(q);
    if (zip && hits.length === 1) { setPlace({ name: hits[0].label, lat: hits[0].lat, lon: hits[0].lon, tz: hits[0].tz }); return; }
    msg.textContent = hits.length ? "" : zip ? `No US ZIP code ${zip[1]} found.` : `No place called “${q}” found.`;
    ul.innerHTML = "";
    for (const h of hits) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = h.label;
      btn.addEventListener("click", () => setPlace({ name: h.label, lat: h.lat, lon: h.lon, tz: h.tz }));
      li.append(btn);
      ul.append(li);
    }
    ul.hidden = hits.length === 0;
    ul.querySelector("button")?.focus();
  } catch {
    msg.textContent = "Lookup isn't working right now. Try “Use my location”.";
  }
});

$("#locate").addEventListener("click", () => {
  const msg = $("#place-msg");
  if (!navigator.geolocation) { msg.textContent = "This browser can't share its location. Enter a ZIP code instead."; return; }
  msg.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setPlace({ name: `Your location (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`, lat, lon, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    },
    () => { msg.textContent = "Couldn't get your location. Enter a ZIP code instead."; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 3600e3 },
  );
});

// ---------- start ----------
(async function init() {
  try {
    const { omm, source, at } = await loadData();
    state.omm = omm;
    state.tles = omm.map(parseOMM).filter(Boolean);
    state.source = source;
    state.fetchedAt = at;
    state.launches = analyzeLaunches(state.tles, Date.now());
  } catch {
    $("#status").innerHTML = `<p class="kicker">Recent Starlink launches</p><p class="headline">Couldn't load orbit data</p><p class="muted">Check your connection and reload.</p>`;
    return;
  }
  if (new URLSearchParams(location.search).has("demo")) state.demo = true;
  const saved = store.get(PLACE_KEY);
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) setPlace(saved);
  else { compute(); $("#place-msg").textContent = "Enter a ZIP code to see when a train passes over you."; }
  setInterval(tick, 1000);
})();
