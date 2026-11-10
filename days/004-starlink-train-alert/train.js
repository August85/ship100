// Train detection for Starlink Train Alert. Pure functions, no DOM, so tests can run in Node.
//
// A "train" is a fresh batch of Starlink satellites still bunched up in a line along one orbit.
// Right after launch all ~25 satellites follow each other a few seconds apart. Over the next
// one to three weeks they raise their orbits at different times and spread around the planet,
// and the train is gone. So for each recent launch we:
//   1. work out where every satellite is along its orbit right now (argument of latitude, degrees),
//   2. find the 45° stretch of orbit that holds the most of them,
//   3. call it a train if most of the launch is in that stretch.
// Passes are then computed for the front, middle and back satellite of the bunch and merged.

import { sgp4init, propagate, julianDate, findPasses } from "./orbit.js";

export const WINDOW_DEG = 45; // a train fits in about 11 minutes of orbit
export const TRAIN_FRAC = 0.6; // at least this share of the launch in the window: a train
export const LOOSE_FRAC = 0.4; // between this and TRAIN_FRAC: a loose string, still worth a look
export const STARLINK_MAG = 3.0; // brightness at 1000 km for satellites still raising their orbit (estimate)
const MIN_SATS = 5;

/** Position along the orbit, measured from the ascending node, in degrees (0–360). */
export function argOfLatitude(sat, ms) {
  const st = propagate(sat, (julianDate(ms) - sat.epochJD) * 1440);
  if (!st) return null;
  const r = st.position, v = st.velocity;
  const h = { x: r.y * v.z - r.z * v.y, y: r.z * v.x - r.x * v.z, z: r.x * v.y - r.y * v.x };
  const n = { x: -h.y, y: h.x };
  const rl = Math.hypot(r.x, r.y, r.z);
  const c = (n.x * r.x + n.y * r.y) / (Math.hypot(n.x, n.y) * rl);
  let u = (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  if (r.z < 0) u = 360 - u;
  return { u, altKm: rl - 6378.135 };
}

/** The `width`-degree arc (on a circle) holding the most angles. Returns its members' indexes, tail first. */
export function densestArc(angles, width = WINDOW_DEG) {
  const idx = angles.map((a, i) => i).sort((a, b) => angles[a] - angles[b]);
  const n = idx.length;
  let best = [];
  for (let s = 0; s < n; s++) {
    const members = [idx[s]];
    for (let k = 1; k < n; k++) {
      const j = idx[(s + k) % n];
      const d = (angles[j] - angles[idx[s]] + 360) % 360;
      if (d > width) break;
      members.push(j);
    }
    if (members.length > best.length) best = members;
  }
  return best;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/**
 * Groups element sets (from parseOMM) by launch and judges each one.
 * Returns launches newest first: { id, count, launchedMs, ageDays, altKm, status, frac, lengthMin, lead, mid, tail, angles }.
 * status is "train", "loose" or "spread".
 */
export function analyzeLaunches(tles, nowMs) {
  const groups = new Map();
  for (const t of tles) {
    if (!(t.demo || /^STARLINK/i.test(t.name)) || !/^[0-9A-Z]{4}-\d{3}/.test(t.intlDes)) continue;
    const id = t.intlDes.slice(0, 8);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(t);
  }
  const out = [];
  for (const [id, ts] of groups) {
    const sats = [];
    for (const t of ts) {
      const sat = sgp4init(t);
      const pos = sat && argOfLatitude(sat, nowMs);
      if (pos) sats.push({ tle: t, sat, ...pos });
    }
    if (sats.length < MIN_SATS) continue;
    // Launch time: epoch minus the orbits flown so far.
    const launchedMs = median(ts.map((t) => (t.epochJD - 2440587.5) * 86400e3 - (t.revAtEpoch / t.meanMotion) * 86400e3));
    const angles = sats.map((s) => s.u);
    const arc = densestArc(angles);
    const frac = arc.length / sats.length;
    const status = frac >= TRAIN_FRAC ? "train" : frac >= LOOSE_FRAC ? "loose" : "spread";
    const tail = sats[arc[0]], lead = sats[arc.at(-1)], mid = sats[arc[Math.floor(arc.length / 2)]];
    const spanDeg = (lead.u - tail.u + 360) % 360;
    const periodMin = 1440 / median(ts.map((t) => t.meanMotion));
    out.push({
      id, count: sats.length, launchedMs, ageDays: (nowMs - launchedMs) / 86400e3,
      altKm: median(sats.map((s) => s.altKm)), status, frac, inTrain: arc.length,
      lengthMin: (spanDeg / 360) * periodMin, lead, mid, tail,
      angles, arcAngles: arc.map((i) => angles[i]),
    });
  }
  return out.sort((a, b) => b.launchedMs - a.launchedMs);
}

/**
 * Visible passes of one train: passes of its front, middle and back satellites that happen
 * within a few minutes of each other are one train pass. Returns passes with a `visible` part only.
 */
export function trainPasses(launch, obs, startMs, days = 5) {
  const members = [["lead", launch.lead], ["mid", launch.mid], ["tail", launch.tail]];
  const all = [];
  for (const [role, m] of members) {
    for (const p of findPasses(m.sat, obs, startMs, days, STARLINK_MAG)) all.push({ ...p, role });
  }
  all.sort((a, b) => a.rise - b.rise);
  const gap = (launch.lengthMin + 12) * 60e3;
  const merged = [];
  for (const p of all) {
    const g = merged.at(-1);
    if (g && p.rise - g.firstRise < gap) g.parts.push(p);
    else merged.push({ firstRise: p.rise, parts: [p] });
  }
  const passes = [];
  for (const g of merged) {
    const vis = g.parts.filter((p) => p.visible);
    if (!vis.length) continue;
    const first = vis.reduce((a, b) => (b.visible.start < a.visible.start ? b : a));
    const last = vis.reduce((a, b) => (b.visible.end > a.visible.end ? b : a));
    const high = vis.reduce((a, b) => (b.visible.peak.elevation > a.visible.peak.elevation ? b : a));
    passes.push({
      start: first.visible.start, end: last.visible.end,
      startAz: first.visible.startAz, startEl: first.visible.startEl,
      endAz: last.visible.endAz, endEl: last.visible.endEl,
      peak: high.visible.peak, magnitude: Math.min(...vis.map((p) => p.visible.magnitude)),
      fadesInShadow: last.visible.fadesInShadow,
      whole: vis.length === 3, roles: vis.map((p) => p.role),
      track: high.track, trackVisible: high.visible,
    });
  }
  return passes;
}

/**
 * A made-up fresh train for the demo: 24 clones of one real satellite, 0.4° apart along its orbit.
 * Uses the recent launch whose orbit gives `obs` the most visible passes, so the demo shows something.
 */
export function demoTLEs(tles, obs, startMs, days = 5) {
  const one = new Map();
  for (const t of tles) if (/^STARLINK/i.test(t.name) && !one.has(t.intlDes.slice(0, 8))) one.set(t.intlDes.slice(0, 8), t);
  let base = null, most = -1;
  for (const t of one.values()) {
    const sat = sgp4init(t);
    if (!sat) continue;
    const n = obs ? findPasses(sat, obs, startMs, days, STARLINK_MAG).filter((p) => p.visible).length : 0;
    if (n > most) { most = n; base = t; }
  }
  if (!base) return [];
  return Array.from({ length: 24 }, (_, i) => ({
    ...base, name: `DEMO-${i + 1}`, noradID: 990000 + i, intlDes: "DEMO-001A", demo: true,
    meanAnomaly: (base.meanAnomaly - i * 0.4 + 360) % 360, revAtEpoch: 20,
  }));
}
