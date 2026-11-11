// Run: node days/005-dark-sky-finder/test/sky.test.mjs
import assert from "node:assert/strict";
import { bortleOf, lightFromPixel, regionFor, radianceGrid, skyGrid, sqmAt, candidateSites, haversineKm, PIXELS_PER_CELL, NATURAL_SQM } from "../sky.js";

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok", name); };

test("Bortle thresholds match AstroScout", () => {
  assert.equal(bortleOf(22.0), 1);
  assert.equal(bortleOf(21.9), 2);
  assert.equal(bortleOf(21.7), 3);
  assert.equal(bortleOf(21.0), 4);
  assert.equal(bortleOf(19.5), 5);
  assert.equal(bortleOf(19.0), 6);
  assert.equal(bortleOf(18.5), 7);
  assert.equal(bortleOf(18.0), 8);
  assert.equal(bortleOf(17.0), 9);
});

test("unlit Black Marble land and sea read as zero light", () => {
  for (const [r, g, b] of [[3, 4, 14], [16, 15, 34], [28, 27, 44], [30, 28, 53]]) assert.equal(lightFromPixel(r, g, b), 0);
  assert.ok(lightFromPixel(255, 255, 255) > lightFromPixel(255, 200, 100));
  assert.ok(lightFromPixel(255, 200, 100) > lightFromPixel(120, 90, 60));
});

// A synthetic image: dark blue land with one bright "city" in the middle.
const region = regionFor(36, -110, 100);
const w = region.cols * PIXELS_PER_CELL, h = region.rows * PIXELS_PER_CELL;
const rgba = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) rgba.set([16, 15, 34, 255], i * 4);
const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) rgba.set([255, 255, 255, 255], (y * w + x) * 4);
const sky = skyGrid(radianceGrid(rgba, w, h, region), region);

test("sky brightens toward the city and is pristine without light", () => {
  const at = (dLatKm) => sqmAt(sky, region, region.lat + dLatKm / 111.2, region.lon);
  const center = at(0), mid = at(30), edge = at(95);
  assert.ok(center < mid && mid < edge, `${center} < ${mid} < ${edge}`);
  assert.ok(bortleOf(center) >= 6, "city centre should be bright, got " + center);
  assert.ok(edge <= NATURAL_SQM && edge > 21.5, "edge should be near-natural, got " + edge);

  const blank = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < w * h; i++) blank.set([16, 15, 34, 255], i * 4);
  const dark = skyGrid(radianceGrid(blank, w, h, region), region);
  assert.ok(dark.sqm.every((v) => v === NATURAL_SQM));
});

test("candidate sites are dark, inside the radius, spaced out and nearest first", () => {
  const { sites, darkestAnywhere } = candidateSites(sky, region, { maxBortle: 3, spacingKm: 15, nearest: 6, darkest: 3 });
  assert.ok(sites.length >= 6);
  for (const s of sites) { assert.ok(s.bortle <= 3); assert.ok(s.km <= 100); }
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) assert.ok(haversineKm(sites[i].lat, sites[i].lon, sites[j].lat, sites[j].lon) >= 15);
  const near = sites.slice(0, 6);
  for (let i = 1; i < near.length; i++) assert.ok(near[i].km >= near[i - 1].km);
  assert.ok(darkestAnywhere.sqm >= sites[0].sqm);
});

console.log(`${n} tests passed`);
