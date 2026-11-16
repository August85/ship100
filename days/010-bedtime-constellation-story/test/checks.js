// Shared checks: run in the browser via test/index.html, or with `node test/run.mjs`.
import { CONSTELLATIONS } from "../stories.js";
import { localSiderealHours, altAz, sunAltitude, zonedInstant, ymdIn, placeConstellation, pickTonight,
  compassWord, heightWords, visibilityScore, dayIndexOf } from "../sky.js";

export function runChecks() {
  const log = [];
  const ok = (cond, msg) => { if (!cond) throw new Error("FAIL " + msg); log.push("ok  " + msg); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // Sidereal time and star positions
  ok(near(localSiderealHours(new Date(Date.UTC(2000, 0, 1, 12)), 0), 18.697, 0.001), "GMST at J2000 is 18.697 h");
  const polaris = CONSTELLATIONS.find((c) => c.id === "ursa-minor").stars[0];
  for (const t of [0, 6, 15]) {
    const p = altAz(polaris[1], polaris[2], new Date(Date.UTC(2026, 10, 16, t)), 40, -74);
    ok(near(p.alt, 40, 1), `Polaris sits about 40° up from latitude 40° (${p.alt.toFixed(2)}°, ${t}h UTC)`);
  }
  // Sirius due south: find the instant when LST = RA, then altitude should be 90 - 40 - 16.72.
  let t = Date.UTC(2026, 10, 16, 0);
  const lst0 = localSiderealHours(new Date(t), -74);
  t += (((6.752 - lst0 + 24) % 24) / 1.0027379) * 3600000;
  const sir = altAz(6.752, -16.72, new Date(t), 40, -74);
  ok(near(sir.alt, 33.28, 0.1) && near(sir.az, 180, 0.5), `Sirius crosses due south at 33.3° (${sir.alt.toFixed(2)}°, az ${sir.az.toFixed(1)}°)`);
  ok(near(sunAltitude(new Date(Date.UTC(2026, 2, 20, 12, 7)), 40, 0), 50, 1.5), "equinox noon Sun is ~50° high at 40°N");
  ok(sunAltitude(new Date(Date.UTC(2026, 10, 17, 4, 30)), 40.7, -74) < -18, "New York at 11:30 pm in November is fully dark");

  // Time zones
  ok(zonedInstant(2026, 11, 16, 19, 30, "America/Los_Angeles").toISOString() === "2026-11-17T03:30:00.000Z", "7:30 pm in LA in November is 03:30 UTC");
  ok(zonedInstant(2026, 7, 1, 20, 0, "America/Los_Angeles").toISOString() === "2026-07-02T03:00:00.000Z", "8 pm in LA in July is 03:00 UTC (daylight time)");
  ok(zonedInstant(2026, 11, 16, 20, 0, "Asia/Kolkata").toISOString() === "2026-11-16T14:30:00.000Z", "8 pm in India is 14:30 UTC");
  const ymd = ymdIn(new Date(Date.UTC(2026, 10, 16, 23)), "Asia/Tokyo");
  ok(ymd.y === 2026 && ymd.m === 11 && ymd.d === 17, "11 pm UTC is already tomorrow in Tokyo");

  // Words
  ok(compassWord(0) === "north" && compassWord(44) === "north-east" && compassWord(350) === "north" && compassWord(225) === "south-west", "compass words");
  ok(heightWords(80) === "almost straight up" && heightWords(20).startsWith("low"), "height words");

  // Data sanity
  for (const c of CONSTELLATIONS) {
    ok(c.lines.every(([a, b]) => a < c.stars.length && b < c.stars.length && a !== b), `${c.name}: lines join real stars`);
    ok(c.story.length >= 4 && c.story.length <= 6 && c.story.join(" ").length < 1100, `${c.name}: story is 4-6 short paragraphs`);
    ok(c.stars.every((s) => s[1] >= 0 && s[1] < 24 && Math.abs(s[2]) <= 90), `${c.name}: star coordinates in range`);
  }

  // Picking tonight's story
  const cities = [["New York", 40.71, -74.01, "America/New_York"], ["London", 51.51, -0.13, "Europe/London"],
    ["Sydney", -33.87, 151.21, "Australia/Sydney"], ["Bengaluru", 12.97, 77.59, "Asia/Kolkata"]];
  for (const [name, lat, lon, tz] of cities) {
    for (const [m, d] of [[1, 15], [4, 15], [7, 15], [11, 16]]) {
      const at = zonedInstant(2026, m, d, 20, 30, tz);
      const { pick } = pickTonight(CONSTELLATIONS, at, lat, lon, dayIndexOf({ y: 2026, m, d }));
      ok(visibilityScore(pick.place) > 0, `${name} ${m}/${d}: tonight's pick (${pick.c.name}) is really up (${pick.place.alt.toFixed(0)}°)`);
    }
  }
  const lon = zonedInstant(2026, 11, 16, 20, 30, "Europe/London");
  ok(placeConstellation(CONSTELLATIONS.find((c) => c.id === "crux"), lon, 51.5, -0.1).alt < 0, "Crux is never up from London");
  const picks = new Set();
  for (let d = 10; d < 17; d++) {
    const at = zonedInstant(2026, 11, d, 20, 0, "America/New_York");
    picks.add(pickTonight(CONSTELLATIONS, at, 40.71, -74.01, dayIndexOf({ y: 2026, m: 11, d })).pick.c.id);
  }
  ok(picks.size >= 3, `a week of New York bedtimes gives ${picks.size} different stories`);
  return log;
}
