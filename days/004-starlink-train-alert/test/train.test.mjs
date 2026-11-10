// Run: node days/004-starlink-train-alert/test/train.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseOMM, parseTLE, sgp4init, propagate } from "../orbit.js";
import { densestArc, analyzeLaunches, trainPasses, demoTLEs } from "../train.js";

const here = new URL("..", import.meta.url);
const omm = JSON.parse(fs.readFileSync(new URL("starlink-recent.json", here)));

// OMM and TLE for the same element set must propagate to the same place.
const iss = parseTLE("ISS", "1 25544U 98067A   24001.50000000  .00016717  00000-0  30571-3 0  9993",
  "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815307432146");
const fromOmm = parseOMM({ OBJECT_NAME: "ISS", OBJECT_ID: "1998-067A", EPOCH: "2024-01-01T12:00:00", MEAN_MOTION: 15.49815307,
  ECCENTRICITY: 0.0006703, INCLINATION: 51.6416, RA_OF_ASC_NODE: 247.4627, ARG_OF_PERICENTER: 130.536, MEAN_ANOMALY: 325.0288,
  NORAD_CAT_ID: 25544, BSTAR: 0.00030571, REV_AT_EPOCH: 43214 });
const a = propagate(sgp4init(iss), 360).position, b = propagate(sgp4init(fromOmm), 360).position;
assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3, "OMM matches TLE");
assert.equal(parseOMM({ OBJECT_NAME: "X" }), null, "incomplete OMM is rejected");
assert.ok(parseOMM(omm[0]).noradID > 99999, "six-digit catalog numbers survive");

// Densest arc wraps around 0°.
assert.equal(densestArc([350, 355, 5, 10, 180], 45).length, 4);
assert.deepEqual(densestArc([10, 20, 200], 45).map((i) => [10, 20, 200][i]), [10, 20]);

// The bundled snapshot (Nov 10, 2026): four launches, all spread out by then.
const tles = omm.map(parseOMM).filter(Boolean);
const snapAt = Date.parse("2026-11-10T12:00:00Z");
const launches = analyzeLaunches(tles, snapAt);
assert.equal(launches.length, 4);
assert.ok(launches.every((l) => l.status === "spread"), "no train in the snapshot");
assert.ok(launches.every((l, i) => i === 0 || l.launchedMs <= launches[i - 1].launchedMs), "newest first");
assert.ok(launches.every((l) => l.ageDays > 10 && l.ageDays < 31), "launch ages from REV_AT_EPOCH");

// The demo train is a train, and from San Francisco it gives merged, visible passes.
const sf = { latitude: 37.77, longitude: -122.41, altitude: 0 };
const demo = analyzeLaunches(demoTLEs(tles, sf, snapAt), snapAt);
assert.equal(demo.length, 1);
assert.equal(demo[0].status, "train");
assert.ok(demo[0].lengthMin > 1 && demo[0].lengthMin < 5);
const passes = trainPasses(demo[0], sf, snapAt, 5);
assert.ok(passes.length >= 1, "demo has passes");
for (const p of passes) {
  assert.ok(p.end > p.start && p.end - p.start < 20 * 60e3, "pass lasts minutes");
  assert.ok(p.peak.elevation > 0 && p.peak.elevation <= 90);
}
for (let i = 1; i < passes.length; i++) assert.ok(passes[i].start - passes[i - 1].start > 60 * 60e3, "one entry per pass, not per satellite");

console.log(`ok: ${launches.length} launches, demo ${passes.length} passes`);
