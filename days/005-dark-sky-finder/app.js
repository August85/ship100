// Dark Sky Finder: Day 5 of Ship 100.
// Pick a place → download NASA night lights for ~250 km around it → AstroScout's sky-glow model
// (sky.js) gives every 3 km cell a Bortle class → the nearest dark cells get real drive times from OSRM.
// No build step, no keys, no tracking.

import * as L from "https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js";
import { regionFor, radianceGrid, skyGrid, candidateSites, sqmAt, bortleOf, BORTLE_INFO, haversineKm, bearingDeg, compass } from "./sky.js";
import { gibsUrl, GIBS_WMS_3857 } from "./gibs.js";

const $ = (s) => document.querySelector(s);
const PLACE_KEY = "dark-sky-finder:place";
const SEARCH_KM = 100; // an hour's drive rarely gets further than this in a straight line
const MAX_DRIVE_S = 3600;
const EXAMPLE = { name: "San Jose, California", lat: 37.3382, lon: -121.8863, example: true };

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- map ----------
const map = L.map("map", { scrollWheelZoom: false, keyboard: true }).setView([EXAMPLE.lat, EXAMPLE.lon], 8);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 17, className: "osm-tiles",
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const nightLights = L.tileLayer.wms(GIBS_WMS_3857, {
  layers: "VIIRS_Black_Marble", format: "image/png", TIME: "2016-01-01", maxNativeZoom: 8, maxZoom: 17,
  attribution: 'Night lights: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>',
});
const shading = L.layerGroup().addTo(map);
const marks = L.layerGroup().addTo(map);

$("#lights").addEventListener("change", (e) => (e.target.checked ? nightLights.addTo(map) : nightLights.remove()));
$("#overlay").addEventListener("change", (e) => (e.target.checked ? shading.addTo(map) : shading.remove()));
map.on("click", (e) => setPlace({ name: `${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`, lat: e.latlng.lat, lon: L.Util.wrapNum(e.latlng.lng, [-180, 180], true) }));

function drawShading(sky, region) {
  const n = sky.size, cv = document.createElement("canvas");
  cv.width = n; cv.height = n;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(n, n);
  const mid = (n - 1) / 2, rMax = SEARCH_KM / region.cellKm + 0.5;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const hex = BORTLE_INFO[bortleOf(sky.sqm[r * n + c])].color;
    const i = ((n - 1 - r) * n + c) * 4; // canvas row 0 is north
    img.data[i] = parseInt(hex.slice(1, 3), 16);
    img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i + 3] = Math.hypot(r - mid, c - mid) <= rMax ? 165 : 0;
  }
  ctx.putImageData(img, 0, 0);
  const south = region.south + sky.r0 * region.cellLat, west = region.west + sky.c0 * region.cellLon;
  shading.clearLayers();
  L.imageOverlay(cv.toDataURL(), [[south, west], [south + n * region.cellLat, west + n * region.cellLon]], { className: "shade", interactive: false }).addTo(shading);
}

// ---------- data ----------
function loadImage(url, ms = 25000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const to = setTimeout(() => { img.src = ""; reject(new Error("timeout")); }, ms);
    img.crossOrigin = "anonymous";
    img.onload = () => { clearTimeout(to); resolve(img); };
    img.onerror = () => { clearTimeout(to); reject(new Error("image failed")); };
    img.src = url;
  });
}

async function nightPixels(region) {
  const { url, width, height } = gibsUrl(region);
  const img = await loadImage(url);
  const cv = document.createElement("canvas");
  cv.width = width; cv.height = height;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
}

// One OSRM table call: drive time and distance from the start to every candidate, plus the nearest road point.
async function driveTimes(place, sites) {
  const pts = [place, ...sites].map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${pts}?sources=0&annotations=duration,distance`, { signal: ctl.signal });
    const j = await res.json();
    if (j.code !== "Ok") throw new Error(j.code);
    return sites.map((s, i) => {
      const d = j.destinations[i + 1];
      return { ...s, driveS: j.durations[0][i + 1], driveKm: j.distances?.[0]?.[i + 1] / 1000, road: d?.name || "", roadLat: d?.location?.[1], roadLon: d?.location?.[0], offRoadKm: (d?.distance || 0) / 1000 };
    });
  } catch {
    // Router down: a rough guess from straight-line distance, clearly labeled.
    return sites.map((s) => ({ ...s, driveS: ((s.km * 1.35) / 70) * 3600, driveKm: s.km * 1.35, estimated: true }));
  } finally { clearTimeout(to); }
}

// ---------- rendering ----------
const pill = (b) => `<span class="pill b${b}" style="--c:${BORTLE_INFO[b].color}">Bortle ${b}</span>`;
const fmtDrive = (s) => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

function renderHere(place, sqm) {
  const b = bortleOf(sqm), info = BORTLE_INFO[b];
  $("#here").innerHTML = `
    <div class="here-top">
      <div class="big b${b}" style="--c:${info.color}"><span>${b}</span></div>
      <div>
        <p class="eyebrow">${place.example ? "Example: " : ""}${esc(place.name)}</p>
        <h2>Bortle ${b} · ${info.name}</h2>
        <p class="muted">Sky brightness about <strong>${sqm.toFixed(2)}</strong> mag/arcsec² (22.0 is pristine). ${info.note}</p>
      </div>
    </div>
    <p id="summary" class="summary muted">Looking for darker skies nearby…</p>
    <div class="row"><button type="button" id="share">Copy link to this place</button></div>`;
  $("#share").addEventListener("click", async () => {
    const u = new URL(location.href.split("?")[0]);
    u.search = new URLSearchParams({ lat: place.lat.toFixed(4), lon: place.lon.toFixed(4), name: place.name }).toString();
    try { await navigator.clipboard.writeText(u.toString()); $("#share").textContent = "Link copied"; }
    catch { history.replaceState(null, "", u); $("#share").textContent = "Link is in the address bar"; }
  });
}

function siteMarker(s, i) {
  const icon = L.divIcon({ className: "", html: `<span class="mk b${s.bortle}" style="--c:${BORTLE_INFO[s.bortle].color}">${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  return L.marker([s.lat, s.lon], { icon, title: `${i + 1}: Bortle ${s.bortle}, ${fmtDrive(s.driveS)}`, keyboard: false })
    .bindPopup(`<strong>${i + 1}. Bortle ${s.bortle}</strong><br>${fmtDrive(s.driveS)} drive${s.road ? `<br>near ${esc(s.road)}` : ""}`);
}

function renderSites(place, sites, note) {
  $("#sites").hidden = false;
  $("#sites-note").textContent = note;
  const ul = $("#site-list");
  ul.innerHTML = "";
  sites.forEach((s, i) => {
    const m = siteMarker(s, i).addTo(marks);
    const dir = compass(bearingDeg(place.lat, place.lon, s.lat, s.lon));
    const li = document.createElement("li");
    li.className = "site";
    li.innerHTML = `
      <span class="num b${s.bortle}" style="--c:${BORTLE_INFO[s.bortle].color}">${i + 1}</span>
      <div class="site-body">
        <p class="site-top">${pill(s.bortle)} <strong>${s.estimated ? "about " : ""}${fmtDrive(s.driveS)}</strong> <span class="muted">· ${Math.round(s.km)} km ${dir}</span></p>
        <p class="muted small">${s.road ? `Near ${esc(s.road)} · ` : ""}SQM ${s.sqm.toFixed(2)} · ${BORTLE_INFO[s.bortle].name}${s.offRoadKm > 1.5 ? ` · ${s.offRoadKm.toFixed(1)} km from the nearest road` : ""}</p>
        <p class="links"><button type="button" class="link">Show on map</button>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat.toFixed(5)},${s.lon.toFixed(5)}" target="_blank" rel="noopener">Directions</a>
        <a href="https://www.openstreetmap.org/?mlat=${s.lat.toFixed(5)}&mlon=${s.lon.toFixed(5)}#map=13/${s.lat.toFixed(4)}/${s.lon.toFixed(4)}" target="_blank" rel="noopener">Open in OSM</a></p>
      </div>`;
    li.querySelector("button").addEventListener("click", () => {
      map.setView([s.lat, s.lon], 11);
      m.openPopup();
      $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    ul.append(li);
  });
}

// ---------- main flow ----------
let run = 0;

async function compute(place) {
  const me = ++run;
  const region = regionFor(place.lat, place.lon, SEARCH_KM);
  marks.clearLayers(); shading.clearLayers();
  $("#sites").hidden = true;
  $("#here").innerHTML = `<p class="muted"><span class="spinner" aria-hidden="true"></span> Reading NASA night lights around ${esc(place.name)}…</p>`;
  L.circleMarker([place.lat, place.lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#1f6feb", fillOpacity: 1 }).bindTooltip("Start").addTo(marks);
  L.circle([place.lat, place.lon], { radius: SEARCH_KM * 1000, color: "#1f6feb", weight: 1, dashArray: "4 6", fill: false, interactive: false }).addTo(marks);
  map.invalidateSize(); // on first load the container may not have its size yet
  map.fitBounds(L.latLng(place.lat, place.lon).toBounds(SEARCH_KM * 2000), { padding: [8, 8], animate: false });

  let sky;
  try {
    const px = await nightPixels(region);
    if (me !== run) return;
    sky = skyGrid(radianceGrid(px.rgba, px.width, px.height, region), region);
  } catch {
    if (me !== run) return;
    $("#here").innerHTML = `<p>Couldn't download NASA's night-lights image just now. <button type="button" id="retry">Try again</button></p>`;
    $("#retry").addEventListener("click", () => compute(place));
    return;
  }
  const hereSqm = sqmAt(sky, region, place.lat, place.lon);
  const hereB = bortleOf(hereSqm);
  renderHere(place, hereSqm);
  drawShading(sky, region);

  // Bortle 1–3 if there is any within reach; otherwise the darkest class that exists nearby.
  let goal = 3;
  let { sites, darkestAnywhere } = candidateSites(sky, region, { maxBortle: goal });
  if (!sites.length && darkestAnywhere) {
    goal = darkestAnywhere.bortle;
    ({ sites } = candidateSites(sky, region, { maxBortle: goal }));
  }
  if (goal >= hereB) {
    $("#summary").textContent = hereB <= 3 ? "You're already under a dark sky. Get away from porch lights and look up." : "Nowhere within about 100 km is darker than where you are.";
    return;
  }

  let routed = await driveTimes(place, sites);
  if (me !== run) return;
  // Prefer the road point when it's still dark; that's where you'd actually park.
  routed = routed.filter((s) => s.driveS != null).map((s) => {
    if (s.roadLat == null) return s;
    const sqm = sqmAt(sky, region, s.roadLat, s.roadLon);
    if (sqm == null || bortleOf(sqm) > goal) return s;
    return { ...s, lat: s.roadLat, lon: s.roadLon, sqm, bortle: bortleOf(sqm), km: haversineKm(place.lat, place.lon, s.roadLat, s.roadLon), offRoadKm: 0 };
  });
  routed.sort((a, b) => a.driveS - b.driveS);
  const unique = [];
  for (const s of routed) if (unique.every((u) => haversineKm(s.lat, s.lon, u.lat, u.lon) > 8)) unique.push(s);
  const inHour = unique.filter((s) => s.driveS <= MAX_DRIVE_S);
  const shown = (inHour.length ? inHour : unique.slice(0, 3)).slice(0, 6);
  const est = shown.some((s) => s.estimated) ? " The route service didn't answer, so drive times are rough estimates from distance." : "";
  const target = goal <= 3 ? "Bortle 3 or darker" : `Bortle ${goal}, the darkest sky within about 100 km`;

  if (!shown.length) { $("#summary").textContent = "Couldn't find a road to any darker spot nearby."; return; }
  const best = shown[0];
  $("#summary").innerHTML = inHour.length
    ? `Nearest ${goal <= 3 ? "dark sky" : "darker sky"}: ${pill(best.bortle)} <strong>${fmtDrive(best.driveS)}</strong> away${best.road ? ` near ${esc(best.road)}` : ""}.`
    : `Nothing ${target.split(",")[0]} within an hour's drive. The closest is <strong>${fmtDrive(best.driveS)}</strong> away.`;
  $("#sites-h").textContent = inHour.length ? `Dark spots within an hour (${target})` : `Closest ${target.split(",")[0]} spots`;
  renderSites(place, shown, `Sorted by drive time. Each is a 3 km patch of sky; find a safe, legal pull-out and let your eyes adjust for 20 minutes.${est}`);
}

function setPlace(place) {
  if (!place.example) store.set(PLACE_KEY, place);
  $("#results").hidden = true;
  $("#q").value = "";
  $("#place-msg").textContent = "Or tap the map to start from anywhere.";
  compute(place);
}

// ---------- place lookup ----------
async function lookupZip(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) return [];
  const j = await res.json();
  return (j.places || []).slice(0, 1).map((p) => ({ name: `${zip} · ${p["place name"]}, ${p["state abbreviation"]}`, lat: Number(p.latitude), lon: Number(p.longitude) }));
}

async function lookupCity(q) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  const hits = (await res.json()).results || [];
  return hits.map((h) => ({ name: [h.name, h.admin1, h.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", "), lat: h.latitude, lon: h.longitude }));
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
    if (hits.length === 1) { setPlace(hits[0]); return; }
    msg.textContent = hits.length ? "Which one?" : zip ? `No US ZIP code ${zip[1]} found.` : `No place called “${q}” found.`;
    ul.innerHTML = "";
    for (const h of hits) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = h.name;
      btn.addEventListener("click", () => setPlace(h));
      li.append(btn);
      ul.append(li);
    }
    ul.hidden = hits.length === 0;
    ul.querySelector("button")?.focus();
  } catch {
    msg.textContent = "Lookup isn't working right now. Try “Use my location”, or tap the map.";
  }
});

$("#locate").addEventListener("click", () => {
  const msg = $("#place-msg");
  if (!navigator.geolocation) { msg.textContent = "This browser can't share its location. Search for a town instead."; return; }
  msg.textContent = "Asking your browser for your location…";
  navigator.geolocation.getCurrentPosition(
    (p) => setPlace({ name: "Your location", lat: p.coords.latitude, lon: p.coords.longitude }),
    () => { msg.textContent = "Location wasn't shared. Search for a town instead."; },
    { maximumAge: 600000, timeout: 15000 },
  );
});

// ---------- start ----------
function initialPlace() {
  const p = new URLSearchParams(location.search);
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (p.has("lat") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180) {
    return { name: (p.get("name") || `${lat.toFixed(3)}, ${lon.toFixed(3)}`).slice(0, 80), lat, lon };
  }
  const saved = store.get(PLACE_KEY);
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon) && typeof saved.name === "string") return saved;
  return EXAMPLE;
}
compute(initialPlace());
