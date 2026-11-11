// Fits MODEL.gamma and MODEL.k in sky.js against reference sites with roughly known sky brightness.
// Usage (Node 18+, needs network): node days/005-dark-sky-finder/tools/calibrate.mjs
// Downloads the same NASA GIBS Black Marble images the page uses, then grid-searches the two constants.
import { inflateSync } from "node:zlib";
import { regionFor, radianceGrid, skyGrid, sqmAt, bortleOf } from "../sky.js";
import { gibsUrl } from "../gibs.js";

// Approximate zenith SQM (mag/arcsec²) from published measurements and the 2015 World Atlas.
// These are ballpark figures; they set the scale, they are not ground truth.
export const REFERENCES = [
  ["Downtown San Francisco", 37.79, -122.41, 17.9],
  ["Walnut Creek (suburb)", 37.91, -122.06, 19.2],
  ["Lick Observatory, Mt Hamilton", 37.34, -121.64, 20.2],
  ["Pinnacles National Park", 36.49, -121.18, 21.4],
  ["Yosemite Valley", 37.74, -119.59, 21.55],
  ["Fresno", 36.74, -119.79, 18.4],
  ["Las Vegas Strip", 36.11, -115.17, 17.4],
  ["Death Valley, Furnace Creek", 36.46, -116.87, 21.75],
  ["Great Basin National Park", 39.0, -114.22, 21.95],
  ["Flagstaff", 35.2, -111.65, 19.9],
  ["Big Bend, Chisos Basin", 29.27, -103.3, 21.95],
  ["Cherry Springs State Park", 41.66, -77.82, 21.8],
  ["Midtown Manhattan", 40.75, -73.99, 17.0],
  ["Bortle 5 outer suburb: Gilroy", 37.0, -121.57, 19.6],
];

// Minimal PNG decoder: 8-bit RGB or RGBA, non-interlaced (what GIBS returns).
export function decodePng(buf) {
  let p = 8, width = 0, height = 0, ctype = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); ctype = data[9]; if (data[8] !== 8 || data[12]) throw new Error("unsupported png"); }
    if (type === "IDAT") idat.push(data);
    p += 12 + len;
  }
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 0;
  if (!bpp) throw new Error("unsupported png color type " + ctype);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < 4; k++) out[(y * width + x) * 4 + k] = k < bpp ? cur[x * bpp + k] : 255;
    prev.set(cur);
  }
  return { width, height, rgba: out };
}

async function load([name, lat, lon, want]) {
  const region = regionFor(lat, lon, 4);
  const { url, width, height } = gibsUrl(region);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: http ${res.status}`);
  return { name, lat, lon, want, region, img: decodePng(Buffer.from(await res.arrayBuffer())), width, height };
}

const predict = (s, model) => sqmAt(skyGrid(radianceGrid(s.img.rgba, s.img.width, s.img.height, s.region, model), s.region, model), s.region, s.lat, s.lon);

if (import.meta.url === `file://${process.argv[1]}`) {
  const sites = [];
  for (const ref of REFERENCES) { sites.push(await load(ref)); process.stdout.write("."); }
  console.log();
  let best = null;
  for (let gamma = 1.5; gamma <= 7.01; gamma += 0.25) {
    for (let p = 1.6; p <= 3.01; p += 0.1) {
      // Glow at k = 1; any other k just rescales it.
      const glows = sites.map((s) => 10 ** ((22 - predict(s, { gamma, k: 1, p })) / 2.5) - 1);
      for (let lk = -6; lk <= 3.01; lk += 0.05) {
        const k = 10 ** lk;
        const err = sites.reduce((e, s, i) => e + (22 - 2.5 * Math.log10(1 + k * glows[i]) - s.want) ** 2, 0);
        if (!best || err < best.err) best = { model: { gamma: +gamma.toFixed(2), k: +k.toPrecision(3), p: +p.toFixed(2) }, err };
      }
    }
  }
  console.log("best", best.model, "rms", Math.sqrt(best.err / sites.length).toFixed(2));
  for (const s of sites) {
    const got = predict(s, best.model);
    console.log(`${s.name.padEnd(32)} want ${s.want.toFixed(2)} (B${bortleOf(s.want)})  got ${got.toFixed(2)} (B${bortleOf(got)})`);
  }
}
