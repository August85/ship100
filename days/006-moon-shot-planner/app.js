// Moon Shot Planner: Day 6 of Ship 100.
// Plain ES module, no build step. Everything runs in the browser; nothing is sent anywhere
// except map tile requests to OpenStreetMap.

import * as A from "https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/esm/astronomy.js";
import * as L from "https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js";
import { planShots, topElevation, suggestedFocal, moonToLandmark, compass, destination } from "./plan.js";
import { LANDMARKS } from "./landmarks.js";

const $ = (s) => document.querySelector(s);
const ui = {
  landmark: $("#landmark"), height: $("#height"), dist: $("#dist"), distOut: $("#distOut"),
  framing: $("#framing"), brightOnly: $("#brightOnly"), status: $("#status"), shots: $("#shots"), detail: $("#detail"),
};
const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const STORE = "ship100.moonshot.v1";

// Distance slider is logarithmic: 300 m to 20 km.
const D_MIN = 300, D_MAX = 20000;
const sliderToDist = (v) => {
  const d = D_MIN * (D_MAX / D_MIN) ** (v / 100);
  return d < 1000 ? Math.round(d / 10) * 10 : Math.round(d / 100) * 100;
};
const distToSlider = (d) => Math.round((100 * Math.log(d / D_MIN)) / Math.log(D_MAX / D_MIN));
const fmtDist = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

// ---- State ----
let state = { landmarkId: "transamerica", custom: null, height: null, dist: 3000, mode: "rise", brightOnly: true };
try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch { /* private mode: defaults */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* ignore */ } };

function currentLandmark() {
  if (state.landmarkId === "custom" && state.custom) return { ...state.custom, height: state.height ?? state.custom.height };
  const lm = LANDMARKS.find((l) => l.id === state.landmarkId) || LANDMARKS[0];
  return { ...lm, height: state.height ?? lm.height };
}

// ---- Controls ----
function fillSelect() {
  const groups = {};
  for (const l of LANDMARKS) (groups[l.city] ||= []).push(l);
  ui.landmark.innerHTML = "";
  for (const [city, list] of Object.entries(groups)) {
    const g = document.createElement("optgroup");
    g.label = city;
    for (const l of list) g.append(new Option(l.name, l.id));
    ui.landmark.append(g);
  }
  if (state.custom) {
    const g = document.createElement("optgroup");
    g.label = "Yours";
    g.append(new Option(`Spot you tapped (${state.custom.lat.toFixed(4)}, ${state.custom.lon.toFixed(4)})`, "custom"));
    ui.landmark.append(g);
  }
  ui.landmark.value = state.landmarkId;
}

function syncControls() {
  const lm = currentLandmark();
  ui.height.value = lm.height;
  ui.dist.value = distToSlider(state.dist);
  ui.distOut.textContent = fmtDist(state.dist);
  ui.brightOnly.checked = state.brightOnly;
  document.querySelector(`input[name=mode][value=${state.mode}]`).checked = true;
  const elev = topElevation(lm.height, state.dist);
  if (elev <= 0.05) {
    ui.framing.innerHTML = `<span class="warn">From ${fmtDist(state.dist)} away the top is below your horizon. Move closer.</span>`;
    return;
  }
  const ratio = moonToLandmark(elev);
  const size = ratio >= 1 ? `the moon looks <strong>${ratio.toFixed(1)}×</strong> as tall as the landmark`
    : `the moon is <strong>${Math.round(ratio * 100)}%</strong> of the landmark's height`;
  let note = "";
  if (elev < 0.8) note = " Very low: haze near the horizon may hide it.";
  else if (elev > 30) note = " Steep angle: step back for a bigger moon.";
  ui.framing.innerHTML = `Top of the landmark is <strong>${elev.toFixed(2)}°</strong> up, so ${size}. Lens: about <strong>${suggestedFocal(elev)} mm</strong> (full frame).${note}`;
}

ui.landmark.addEventListener("change", () => {
  state.landmarkId = ui.landmark.value;
  state.height = null;
  replan(true);
});
ui.height.addEventListener("change", () => {
  const h = Number(ui.height.value);
  if (h >= 5 && h <= 1000) state.height = h;
  replan(false);
});
let slideTimer;
ui.dist.addEventListener("input", () => {
  state.dist = sliderToDist(Number(ui.dist.value));
  ui.distOut.textContent = fmtDist(state.dist);
  clearTimeout(slideTimer);
  slideTimer = setTimeout(() => replan(false), 120);
});
document.querySelectorAll("input[name=mode]").forEach((r) => r.addEventListener("change", () => {
  state.mode = r.value;
  replan(false);
}));
ui.brightOnly.addEventListener("change", () => {
  state.brightOnly = ui.brightOnly.checked;
  save();
  render();
});

// ---- Map ----
const map = L.map("map", { scrollWheelZoom: false, maxZoom: 18 }).setView([37.7952, -122.4028], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "© OpenStreetMap",
}).addTo(map);
const layer = L.layerGroup().addTo(map);
map.on("click", (e) => {
  state.custom = { id: "custom", name: "the spot you tapped", city: "", lat: e.latlng.lat, lon: e.latlng.lng, height: Number(ui.height.value) || 50, tz: BROWSER_TZ };
  state.landmarkId = "custom";
  state.height = state.custom.height;
  fillSelect();
  replan(true);
});

function drawMap(lm, shot, fit) {
  layer.clearLayers();
  L.circleMarker([lm.lat, lm.lon], { radius: 8, color: "#c2410c", weight: 3, fillColor: "#fb923c", fillOpacity: 0.9, bubblingMouseEvents: false })
    .bindTooltip(lm.name, { direction: "top" }).addTo(layer);
  if (shot) {
    const beyond = destination(lm.lat, lm.lon, shot.azimuth, state.dist * 0.6);
    L.polyline([[shot.stand.lat, shot.stand.lon], [lm.lat, lm.lon], [beyond.lat, beyond.lon]], { color: "#6d28d9", weight: 3, dashArray: "6 6" }).addTo(layer);
    L.circleMarker([beyond.lat, beyond.lon], { radius: 10, color: "#6d28d9", weight: 2, fillColor: "#f5f3ff", fillOpacity: 1, bubblingMouseEvents: false })
      .bindTooltip("Moon direction", { direction: "top" }).addTo(layer);
    L.circleMarker([shot.stand.lat, shot.stand.lon], { radius: 9, color: "#1d4ed8", weight: 3, fillColor: "#60a5fa", fillOpacity: 1, bubblingMouseEvents: false })
      .bindTooltip("Stand here", { direction: "top", permanent: true }).addTo(layer);
    if (fit) map.fitBounds(L.latLngBounds([[shot.stand.lat, shot.stand.lon], [beyond.lat, beyond.lon]]).pad(0.25));
  } else if (fit) {
    map.setView([lm.lat, lm.lon], 14);
  }
}

// ---- Planning and rendering ----
let plan = { elev: 0, shots: [] };
let selected = null;

function replan(fitMap) {
  save();
  fillSelect();
  syncControls();
  const lm = currentLandmark();
  ui.status.textContent = "Working it out…";
  // Let the status paint before the (short) calculation.
  requestAnimationFrame(() => setTimeout(() => {
    const t0 = performance.now();
    plan = planShots(A, lm, { dist: state.dist, days: 60, mode: state.mode });
    plan.ms = Math.round(performance.now() - t0);
    selected = pickBest(visibleShots());
    render();
  }, 0));
}

const visibleShots = () => plan.shots.filter((s) => !state.brightOnly || s.illum >= 0.5);
const pickBest = (list) => list.reduce((best, s) => (!best || s.score > best.score ? s : best), null);

function fmt(date, tz, opts) {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }).format(date);
}

function quality(score) {
  if (score >= 80) return ["great", "Great"];
  if (score >= 55) return ["good", "Good"];
  return ["ok", "Okay"];
}

function render() {
  const lm = currentLandmark();
  const list = visibleShots();
  if (!list.includes(selected)) selected = pickBest(list);
  const verb = state.mode === "rise" ? "rises" : "sets";
  if (!plan.shots.length) {
    ui.status.textContent = plan.elev <= 0.05 ? "Move closer: the landmark's top is below your horizon from here." : "No matches found in the next 60 days.";
  } else {
    const tzNote = lm.tz === BROWSER_TZ ? "" : ` Times are local to ${lm.city || "the landmark"} (${lm.tz.replace(/_/g, " ")}).`;
    ui.status.textContent = `The moon ${verb} behind ${lm.name} ${list.length} times in the next 60 days${state.brightOnly ? " while at least half lit" : ""}.${tzNote}`;
  }
  ui.shots.innerHTML = "";
  for (const s of list) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    const [cls, label] = quality(s.score);
    b.className = "shot" + (s === selected ? " sel" : "");
    b.setAttribute("aria-pressed", String(s === selected));
    b.innerHTML = `
      <span class="when"><strong>${fmt(s.date, lm.tz, { weekday: "short", month: "short", day: "numeric" })}</strong>
        <span>${fmt(s.date, lm.tz, { hour: "numeric", minute: "2-digit" })}</span></span>
      <span class="what">${moonGlyph(s)} ${s.phase}, ${Math.round(s.illum * 100)}% lit · ${s.light}</span>
      <span class="tag ${cls}">${label}</span>`;
    b.addEventListener("click", () => { selected = s; render(); ui.detail.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    li.append(b);
    ui.shots.append(li);
  }
  renderDetail(lm, selected);
  drawMap(lm, selected, true);
}

function moonGlyph(s) {
  // Simple lit-fraction disc, drawn in CSS with a conic shadow.
  const pct = Math.round(s.illum * 100);
  const waxing = /Waxing|First/.test(s.phase);
  return `<span class="moon ${waxing ? "wax" : "wane"}" style="--lit:${pct}%" aria-hidden="true"></span>`;
}

function renderDetail(lm, s) {
  if (!s) { ui.detail.hidden = true; return; }
  ui.detail.hidden = false;
  const lat = s.stand.lat.toFixed(5), lon = s.stand.lon.toFixed(5);
  const sun = s.sunAlt >= 0 ? `sun ${s.sunAlt.toFixed(0)}° up` : `sun ${Math.abs(s.sunAlt).toFixed(0)}° down`;
  const [cls, label] = quality(s.score);
  const verb = state.mode === "rise" ? "rises past" : "sinks to";
  ui.detail.innerHTML = `
    <div class="d-head">
      <div>
        <p class="eyebrow">${label} shot <span class="tag ${cls}">${s.score}/100</span></p>
        <h2>${fmt(s.date, lm.tz, { weekday: "long", month: "long", day: "numeric" })}</h2>
        <p class="big">${fmt(s.date, lm.tz, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</p>
      </div>
      ${moonGlyph(s).replace('class="moon', 'class="moon lg')}
    </div>
    <dl class="facts">
      <div><dt>Stand here</dt><dd><code>${lat}, ${lon}</code> <button type="button" id="copy" class="small">Copy</button></dd></div>
      <div><dt>Distance</dt><dd>${fmtDist(state.dist)} ${compass((s.azimuth + 180) % 360)} of ${lm.name}</dd></div>
      <div><dt>Face</dt><dd>${s.facing.toFixed(1)}° (${compass(s.facing)}), straight at the landmark</dd></div>
      <div><dt>Moon</dt><dd>${s.phase}, ${Math.round(s.illum * 100)}% lit, ${verb} the top at ${s.elevation.toFixed(2)}°</dd></div>
      <div><dt>Light</dt><dd>${s.light[0].toUpperCase() + s.light.slice(1)} (${sun})</dd></div>
    </dl>
    <p class="links">
      <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}" target="_blank" rel="noopener">Open in OpenStreetMap</a>
      <a href="https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}" target="_blank" rel="noopener">Google Maps</a>
    </p>
    <p class="muted small-print">Get there 30 minutes early. The moon slides its own width in about two minutes, so walk a few steps left or right to line it up. If the spot is on water or private land, slide the distance.</p>`;
  $("#copy").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(`${lat}, ${lon}`); e.target.textContent = "Copied"; }
    catch { e.target.textContent = "Copy failed"; }
  });
}

replan(true);
