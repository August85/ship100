// ISS Tonight: Day 3 of Ship 100.
// Finds the next naked-eye passes of the ISS for a place and gives each one a calendar reminder.
// Orbit math in orbit.js (ported from SatellitePaglu). No build step, no keys, no tracking.

import { parseTLEText, sgp4init, findPasses, compassPoint } from "./orbit.js";

const $ = (s) => document.querySelector(s);
const PLACE_KEY = "iss-tonight:place";
const TLE_KEY = "iss-tonight:tle";
const LOW_KEY = "iss-tonight:show-low";
const GOOD_EL = 10; // passes that never get higher than this are "low"
const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};

const state = { place: null, sat: null, tle: null, tleSource: "", passes: [], shown: null, timer: 0 };

// ---------- orbit data ----------
async function loadTLE() {
  const cached = store.get(TLE_KEY);
  // CelesTrak asks clients not to re-download the same data more than every couple of hours.
  if (cached?.text && Date.now() - cached.at < 2 * 3600e3) return { text: cached.text, source: "CelesTrak" };
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(CELESTRAK, { signal: ctl.signal });
    clearTimeout(to);
    const text = await res.text();
    if (!res.ok || !parseTLEText(text)) throw new Error("bad response");
    store.set(TLE_KEY, { text, at: Date.now() });
    return { text, source: "CelesTrak" };
  } catch {
    if (cached?.text) return { text: cached.text, source: "CelesTrak (saved copy)" };
    const res = await fetch("iss.tle");
    return { text: await res.text(), source: "bundled copy" };
  }
}

// ---------- formatting ----------
const tzOf = () => state.place?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmt = (ms, opts) => new Intl.DateTimeFormat(undefined, { timeZone: tzOf(), ...opts }).format(ms);
const timeStr = (ms) => fmt(ms, { hour: "numeric", minute: "2-digit" });
const dateKey = (ms) => fmt(ms, { year: "numeric", month: "2-digit", day: "2-digit" });
const hourIn = (ms) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tzOf(), hour: "2-digit", hourCycle: "h23" }).format(ms));

function dayLabel(ms) {
  const now = Date.now();
  const part = hourIn(ms) < 12 ? "morning" : hourIn(ms) < 17 ? "afternoon" : "evening";
  if (dateKey(ms) === dateKey(now)) return part === "evening" ? "Tonight" : `This ${part}`;
  if (dateKey(ms) === dateKey(now + 86400e3)) return `Tomorrow ${part}`;
  return fmt(ms, { weekday: "long" }) + " " + part;
}
const longDate = (ms) => fmt(ms, { weekday: "short", month: "short", day: "numeric" });

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
  if (mag <= -3) return { n: 4, label: "Very bright" };
  if (mag <= -1.5) return { n: 3, label: "Bright" };
  if (mag <= 0) return { n: 2, label: "Easy to see" };
  return { n: 1, label: "Faint" };
}
const dots = (n) => `<span class="bright" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mins = (v) => Math.max(1, Math.round((v.end - v.start) / 60e3));

// ---------- sky dome (SVG) ----------
function domeSVG(pass) {
  const R = 100, C = 120;
  const pt = (az, el) => {
    const r = ((90 - Math.max(0, el)) / 90) * R, a = (az * Math.PI) / 180;
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  };
  const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const v = pass.visible;
  const all = pass.track.map((s) => pt(s.azimuth, s.elevation));
  const vis = [pt(v.startAz, v.startEl),
    ...pass.track.filter((s) => s.ms > v.start && s.ms < v.end).map((s) => pt(s.azimuth, s.elevation)),
    pt(v.endAz, v.endEl)];
  const [sx, sy] = vis[0], [ex, ey] = vis.at(-1);
  return `<svg class="dome" viewBox="0 0 240 240" role="img" aria-label="Sky map, north at the top: the station's path from ${compassPoint(v.startAz)} to ${compassPoint(v.endAz)}, highest ${Math.round(v.peak.elevation)} degrees">
    <defs><radialGradient id="skygrad"><stop offset="0" stop-color="#1e3a6a"/><stop offset="1" stop-color="#0b1026"/></radialGradient></defs>
    <circle class="bg" cx="${C}" cy="${C}" r="${R + 14}"/>
    <circle class="ring" cx="${C}" cy="${C}" r="${R}"/><circle class="ring" cx="${C}" cy="${C}" r="${(R * 60) / 90}"/><circle class="ring" cx="${C}" cy="${C}" r="${(R * 30) / 90}"/>
    <text class="lbl" x="${C}" y="${C - R - 7}">N</text><text class="lbl" x="${C + R + 7}" y="${C}">E</text>
    <text class="lbl" x="${C}" y="${C + R + 7}">S</text><text class="lbl" x="${C - R - 7}" y="${C}">W</text>
    <path class="trk" d="${path(all)}"/>
    <path class="vis" d="${path(vis)}"/>
    <circle class="dot" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"/>
    <circle class="end" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4.5"/>
  </svg>`;
}

// ---------- calendar file ----------
function icsFor(pass) {
  const v = pass.visible;
  const z = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const escI = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const desc = [
    `${timeStr(v.start)}: appears in ${dir(v.startAz)}, ${up(v.startEl)}.`,
    `${timeStr(v.peak.ms)}: highest, ${Math.round(v.peak.elevation)}° up in ${dir(v.peak.azimuth)}.`,
    `${timeStr(v.end)}: ${v.fadesInShadow ? "fades out" : "sets"} in ${dir(v.endAz)}.`,
    `${brightness(v.magnitude).label}. Looks like a steady, moving star with no blinking lights.`,
    "From ISS Tonight: https://august85.github.io/ship100/days/003-iss-tonight/",
  ].join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ship 100//ISS Tonight//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:iss-${z(v.start)}-${state.place.lat.toFixed(2)}-${state.place.lon.toFixed(2)}@ship100`,
    `DTSTAMP:${z(Date.now())}`,
    `DTSTART:${z(v.start - 60e3)}`,
    `DTEND:${z(v.end + 60e3)}`,
    `SUMMARY:${escI(`See the ISS: look ${compassPoint(v.startAz)}, up to ${Math.round(v.peak.elevation)}°`)}`,
    `DESCRIPTION:${escI(desc)}`,
    `LOCATION:${escI(state.place.name)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:ISS pass in 10 minutes", "TRIGGER:-PT10M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  // iCalendar lines should stay under 75 bytes; continuation lines start with a space.
  const fold = (l) => l.match(/.{1,60}/gu).join("\r\n ");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function downloadICS(pass) {
  const blob = new Blob([icsFor(pass)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `iss-pass-${new Date(pass.visible.start).toISOString().slice(0, 16).replace(/[-:T]/g, "")}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- rendering ----------
const isGood = (p) => p.visible && p.visible.peak.elevation >= GOOD_EL;
const showLow = () => $("#show-low").checked;
const upcoming = () => state.passes.filter((p) => p.visible && p.visible.end > Date.now() && (showLow() || isGood(p)));

function renderNext() {
  const el = $("#next");
  const pass = upcoming()[0];
  state.shown = pass || null;
  el.hidden = false;
  if (!pass) {
    el.innerHTML = `<div><p class="kicker">Next visible pass</p><p class="when">None in the next 10 days</p>
      <p class="muted">You can only see the station around dawn and dusk, so some weeks there's nothing to see.
      ${showLow() ? "" : "Try <b>Include low passes</b> below, or "}check back in a few days.</p></div>`;
    return;
  }
  const v = pass.visible;
  const b = brightness(v.magnitude);
  const live = Date.now() >= v.start;
  el.dataset.live = live ? "1" : "";
  const step = (ms, html) => `<li><span class="t">${esc(timeStr(ms))}</span><span>${html}</span></li>`;
  const peakText = `<b>${Math.round(v.peak.elevation)}° up</b> in ${dir(v.peak.azimuth)}, ${fists(v.peak.elevation)}`;
  // When the station fades out at its highest point, say that once instead of twice.
  const fadesAtPeak = v.fadesInShadow && v.end - v.peak.ms < 30e3;
  const steps = [
    step(v.start, `Appears in <b>${dir(v.startAz)}</b>, ${up(v.startEl)}`),
    fadesAtPeak
      ? step(v.end, `Climbs to ${peakText}, then fades into Earth's shadow`)
      : step(v.peak.ms, `Highest: ${peakText}`),
    fadesAtPeak ? "" : step(v.end, `${v.fadesInShadow ? "Fades into Earth's shadow" : "Sets"} in <b>${dir(v.endAz)}</b>${v.fadesInShadow ? `, ${up(v.endEl)}` : ""}`),
  ].join("");
  el.innerHTML = `
    <div>
      <p class="kicker">${live ? "Visible right now" : `Next visible pass · ${esc(longDate(v.start))}`}</p>
      <p class="when">${live ? "Look up!" : `${esc(dayLabel(v.start))}, ${esc(timeStr(v.start))}`}</p>
      <p class="countdown" id="cd">${live ? `ends ${countdown(v.end)}` : countdown(v.start)}</p>
      <ol class="steps">${steps}</ol>
      <div class="meta">
        <span>Visible for ${mins(v)} min</span>
        <span>${dots(b.n)} ${b.label} <span title="Estimated magnitude; lower is brighter">(mag ${v.magnitude.toFixed(1).replace("-", "−")})</span></span>
      </div>
      <div class="actions">
        <button class="primary" type="button" data-ics>Remind me (.ics)</button>
      </div>
    </div>
    <div class="dome-wrap">${domeSVG(pass)}</div>`;
  el.querySelector("[data-ics]").addEventListener("click", () => downloadICS(pass));
}

function renderList() {
  const ol = $("#list"), empty = $("#list-empty");
  $("#list-wrap").hidden = false;
  const list = upcoming();
  ol.innerHTML = "";
  empty.hidden = list.length > 0;
  empty.textContent = "No visible passes in this window.";
  for (const p of list) {
    const v = p.visible, b = brightness(v.magnitude);
    const soon = dateKey(v.start) === dateKey(Date.now()) || dateKey(v.start) === dateKey(Date.now() + 86400e3);
    const li = document.createElement("li");
    li.className = "pass" + (isGood(p) ? "" : " low");
    li.innerHTML = `
      <div class="d">${esc(longDate(v.start))}, ${esc(timeStr(v.start))}${soon ? `<span class="rel">${esc(dayLabel(v.start))}</span>` : ""}</div>
      <div class="r">${dots(b.n)}<span class="sr-only">${b.label}</span>
        <button type="button" aria-label="Add the ${esc(longDate(v.start))} ${esc(timeStr(v.start))} pass to your calendar">.ics</button></div>
      <div class="s">${compassPoint(v.startAz)} → ${compassPoint(v.endAz)} · up to ${Math.round(v.peak.elevation)}° · ${mins(v)} min${isGood(p) ? "" : " · low"}</div>`;
    li.querySelector("button").addEventListener("click", () => downloadICS(p));
    ol.append(li);
  }
}

function renderNote() {
  const ageDays = Math.round((Date.now() - (state.tle.epochJD - 2440587.5) * 86400e3) / 86400e3);
  $("#data-note").textContent =
    `Orbit from ${state.tleSource}, measured ${ageDays < 1 ? "less than a day" : `${ageDays} day${ageDays > 1 ? "s" : ""}`} ago. ` +
    `Times are for ${tzOf().replace(/_/g, " ")}. Passes a week out can shift by a minute or so when the station's orbit is adjusted, so check again closer to the day.` +
    (ageDays > 14 ? " This orbit data is old, so treat these times as rough." : "");
}

function compute() {
  if (!state.place || !state.sat) return;
  const obs = { latitude: state.place.lat, longitude: state.place.lon, altitude: 0 };
  state.passes = findPasses(state.sat, obs, Date.now() - 15 * 60e3, 10);
  renderNext();
  renderList();
  renderNote();
}

function tick() {
  const s = state.shown;
  if (!s) return;
  const now = Date.now();
  if (now > s.visible.end || (now >= s.visible.start && !$("#next").dataset.live)) { renderNext(); renderList(); return; }
  const cd = $("#cd");
  if (cd) cd.textContent = now >= s.visible.start ? `ends ${countdown(s.visible.end)}` : countdown(s.visible.start);
}

// ---------- place ----------
function setPlace(place) {
  state.place = place;
  store.set(PLACE_KEY, place);
  $("#place-name").textContent = place.name;
  $("#results").hidden = true;
  $("#q").value = "";
  $("#place-msg").textContent = "Your location stays in this browser.";
  compute();
}

$("#locate").addEventListener("click", () => {
  const msg = $("#place-msg");
  if (!navigator.geolocation) { msg.textContent = "This browser can't share its location. Search for a city instead."; return; }
  msg.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setPlace({ name: `Your location (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`, lat, lon, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    },
    () => { msg.textContent = "Couldn't get your location. Search for a city instead."; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 3600e3 },
  );
});

$("#search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  const ul = $("#results"), msg = $("#place-msg");
  if (q.length < 2) return;
  msg.textContent = "Searching…";
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    const hits = (await res.json()).results || [];
    msg.textContent = hits.length ? "" : `No place called “${q}” found.`;
    ul.innerHTML = "";
    for (const h of hits) {
      const label = [h.name, h.admin1, h.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => setPlace({ name: label, lat: h.latitude, lon: h.longitude, tz: h.timezone }));
      li.append(btn);
      ul.append(li);
    }
    ul.hidden = hits.length === 0;
    ul.querySelector("button")?.focus();
  } catch {
    msg.textContent = "Search isn't working right now. Try “Use my location”.";
  }
});

$("#show-low").addEventListener("change", (e) => {
  store.set(LOW_KEY, e.target.checked);
  renderNext();
  renderList();
});

// ---------- start ----------
(async function init() {
  $("#show-low").checked = !!store.get(LOW_KEY);
  try {
    const { text, source } = await loadTLE();
    state.tle = parseTLEText(text);
    state.sat = sgp4init(state.tle);
    state.tleSource = source;
    if (!state.sat) throw new Error("bad orbit");
  } catch {
    $("#place-msg").textContent = "Couldn't load the station's orbit. Check your connection and reload.";
    return;
  }
  const saved = store.get(PLACE_KEY);
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) setPlace(saved);
  else $("#place-msg").textContent = "Pick a place to see when the station flies over.";
  state.timer = setInterval(tick, 1000);
})();
