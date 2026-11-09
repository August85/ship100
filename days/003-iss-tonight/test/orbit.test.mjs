// Run: node days/003-iss-tonight/test/orbit.test.mjs
// Reference values copied from SatellitePaglu's SGP4Tests (satellite.js 5.0.0 / Vallado).
import assert from "node:assert/strict";
import { parseTLE, sgp4init, propagate, gmst, julianDate, msFromJulian, observerEcf, observe, findPasses } from "../orbit.js";

const cases = [
  ["1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753",
   "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667", 2451723.28495062,
   [[0, [7022.465293, -1400.082968, 0.039952]], [360, [-7154.031202, -3783.176825, -3536.194123]],
    [1440, [-938.559239, -6268.187488, -4294.029248]], [4320, [-9060.473736, 4658.709525, 813.686732]]]],
  ["1 25544U 98067A   24001.50000000  .00016717  00000-0  30571-3 0  9993",
   "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815307432146", 2460311.0,
   [[0, [4123.014405, -1003.151644, 5293.896712]], [360, [1290.394745, -5218.359619, 4147.506560]],
    [1440, [-4177.986977, 1017.027892, -5272.478856]], [4320, [-4322.077447, 1057.688870, -5146.440083]]]],
  ["1 28057U 03049A   06177.78615833  .00000060  00000-0  35940-4 0  1836",
   "2 28057  98.4283 247.6961 0000884  88.1964 271.9322 14.35478080140550", 2453913.28615833,
   [[0, [-2715.282375, -6619.264369, -0.013414]], [360, [2801.256072, 5455.039313, -3692.128657]],
    [1440, [688.160566, 4124.876190, 5794.559944]], [4320, [-2543.092025, -6454.420576, 1740.215621]]]],
];
for (const [l1, l2, epoch, samples] of cases) {
  const tle = parseTLE("T", l1, l2);
  assert.ok(Math.abs(tle.epochJD - epoch) < 1e-6, "epoch " + tle.noradID);
  const s = sgp4init(tle);
  for (const [t, r] of samples) {
    const p = propagate(s, t).position;
    const err = Math.hypot(p.x - r[0], p.y - r[1], p.z - r[2]);
    assert.ok(err < 1e-3, `${tle.noradID} t=${t} err=${err}`);
  }
}
// Look angles (same check as SatellitePaglu's testLookAngles).
const iss = sgp4init(parseTLE("ISS", cases[1][0], cases[1][1]));
const jd = 2460311.27083333;
assert.ok(Math.abs(gmst(julianDate(msFromJulian(jd))) - 0.3213569998) < 1e-6, "gmst");
const obs = { latitude: 28.6139, longitude: 77.2090, altitude: 0.2 };
const o = observe(iss, obs, observerEcf(obs), msFromJulian(jd));
assert.ok(Math.abs(o.azimuth - 249.051773) < 0.01, "az " + o.azimuth);
assert.ok(Math.abs(o.elevation + 14.848934) < 0.01, "el " + o.elevation);
// Deep-space is skipped.
assert.equal(sgp4init(parseTLE("GPS", "1 24876U 97035A   24001.00000000  .00000000  00000-0  00000-0 0  9990",
  "2 24876  55.5000 100.0000 0050000  50.0000 310.0000  2.00560000000000")), null);
// Passes: sane shape over 3 days from the TLE epoch.
const passes = findPasses(iss, obs, msFromJulian(2460311.0), 3);
assert.ok(passes.length >= 10 && passes.length <= 30, "pass count " + passes.length);
for (const p of passes) {
  assert.ok(p.set > p.rise && p.set - p.rise < 15 * 60000, "duration");
  assert.ok(p.peak.elevation > 0 && p.peak.elevation <= 90);
  if (p.visible) assert.ok(p.visible.end >= p.visible.start && p.visible.start >= p.rise - 1000 && p.visible.end <= p.set + 1000);
}
console.log("ok:", passes.length, "passes,", passes.filter((p) => p.visible).length, "visible");
