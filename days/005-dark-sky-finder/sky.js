// Sky-brightness model for Dark Sky Finder.
// A browser port of AstroScout's light-pollution grid (tools/build_light_pollution_grid.py and
// LightPollution.swift): night-lights radiance → spread with a distance kernel (r^-2.5 out to 150 km)
// → zenith brightness SQM = 22.0 - 2.5·log10(1 + k·glow) → Bortle class.
// Pure functions, no DOM, so Node tests and the calibration script can use them too.

export const NATURAL_SQM = 22.0;
export const KERNEL_KM = 150;
export const CELL_DEG = 0.03; // ≈ 3.3 km north–south; east–west is widened so cells are square in km
export const PIXELS_PER_CELL = 3;
export const KM_PER_DEG = 111.2;

// Fitted by tools/calibrate.mjs against reference sites (see README).
export const MODEL = { gamma: 6.75, k: 0.891, p: 1.8 };

// Same thresholds as AstroScout's SkyBrightness.bortle.
const BORTLE_MIN_SQM = [21.99, 21.89, 21.69, 20.49, 19.5, 18.94, 18.38, 17.8];

export function bortleOf(sqm) {
  for (let i = 0; i < BORTLE_MIN_SQM.length; i++) if (sqm >= BORTLE_MIN_SQM[i]) return i + 1;
  return 9;
}

export const BORTLE_INFO = {
  1: { name: "Excellent dark sky", color: "#0b0d1a", note: "Zodiacal light, airglow, the Milky Way casts shadows." },
  2: { name: "Truly dark sky", color: "#1c2a59", note: "Milky Way looks like veined marble; clouds are black holes in the stars." },
  3: { name: "Rural sky", color: "#1f5d8c", note: "Milky Way still detailed; a little glow on the horizon." },
  4: { name: "Rural/suburban transition", color: "#2e8a4a", note: "Light domes over towns; Milky Way visible but washed out low down." },
  5: { name: "Suburban sky", color: "#c9b52b", note: "Milky Way faint or gone near the horizon." },
  6: { name: "Bright suburban", color: "#d9802a", note: "Milky Way only near the zenith, if at all." },
  7: { name: "Suburban/urban transition", color: "#cc4b2b", note: "Sky has a grey-orange glow." },
  8: { name: "City sky", color: "#e8a0b4", note: "Only bright stars and planets." },
  9: { name: "Inner-city sky", color: "#f4f1ea", note: "A few dozen stars at most." },
};

export const sqmFromGlow = (glow, k = MODEL.k) => NATURAL_SQM - 2.5 * Math.log10(1 + k * glow);

// Black Marble pixels are a tone-mapped picture, not radiance. Unlit land is dim blue (about 16,15,34),
// city light is warm. Take the brightness above that blue baseline, then undo the tone curve with a power.
export function lightFromPixel(r, g, b) {
  const lum = 0.3 * r + 0.6 * g + 0.1 * b;
  return Math.max(0, lum - Math.min(0.65 * b, 40) - 2);
}
export const radianceFromLight = (light, gamma = MODEL.gamma) => 100 * Math.pow(light / 255, gamma);

const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compass = (deg) => POINTS[Math.round(deg / 45) % 8];

// The area to download: the search radius plus the kernel reach, so glow from cities just outside
// the search area still counts.
export function regionFor(lat, lon, searchKm = 100) {
  const cellLat = CELL_DEG;
  const cosLat = Math.max(0.2, Math.cos(toRad(lat)));
  const cellLon = CELL_DEG / cosLat;
  const cellKm = CELL_DEG * KM_PER_DEG;
  const half = Math.ceil((searchKm + KERNEL_KM) / cellKm);
  const rows = 2 * half + 1, cols = 2 * half + 1;
  const south = Math.max(-85, lat - (half + 0.5) * cellLat);
  const west = lon - (half + 0.5) * cellLon;
  return {
    lat, lon, searchKm, cellLat, cellLon, cellKm, rows, cols,
    south, north: south + rows * cellLat, west, east: west + cols * cellLon,
    searchCells: Math.ceil(searchKm / cellKm),
  };
}

// Average PIXELS_PER_CELL² pixels of an RGBA image (north-up, covering the region) into a
// row-major radiance grid with row 0 at the south edge, like AstroScout's grid file.
export function radianceGrid(rgba, width, height, region, model = MODEL) {
  const { rows, cols } = region;
  const fx = width / cols, fy = height / rows;
  const out = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((rows - 1 - r) * fy), y1 = Math.max(y0 + 1, Math.floor((rows - r) * fy));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * fx), x1 = Math.max(x0 + 1, Math.floor((c + 1) * fx));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        sum += radianceFromLight(lightFromPixel(rgba[i], rgba[i + 1], rgba[i + 2]), model.gamma);
        n++;
      }
      out[r * cols + c] = n ? sum / n : 0;
    }
  }
  return out;
}

// Spread light with the r^-2.5 kernel and turn it into SQM, for the cells inside the search radius.
// Returns { sqm: Float32Array(size²), size, r0, c0 } where (r0, c0) is the grid cell of sqm[0].
export function skyGrid(radiance, region, model = MODEL) {
  const { rows, cols, cellKm, searchCells } = region;
  const cr = (rows - 1) / 2, cc = (cols - 1) / 2;
  const reach = Math.floor(KERNEL_KM / cellKm);
  const kw = 2 * reach + 1;
  const kernel = new Float32Array(kw * kw);
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const d = Math.max(Math.hypot(dx, dy) * cellKm, cellKm / 2);
    kernel[(dy + reach) * kw + dx + reach] = d > KERNEL_KM ? 0 : d ** -(model.p ?? 2.5);
  }
  // Only lit cells matter as sources; most of the countryside is zero.
  const lit = [];
  for (let i = 0; i < radiance.length; i++) if (radiance[i] > 1e-4) lit.push(i);
  const size = 2 * searchCells + 1, r0 = cr - searchCells, c0 = cc - searchCells;
  const glow = new Float32Array(size * size);
  for (const i of lit) {
    const sr = Math.floor(i / cols), sc = i % cols, v = radiance[i];
    const tr0 = Math.max(r0, sr - reach), tr1 = Math.min(r0 + size - 1, sr + reach);
    const tc0 = Math.max(c0, sc - reach), tc1 = Math.min(c0 + size - 1, sc + reach);
    for (let tr = tr0; tr <= tr1; tr++) {
      const krow = (tr - sr + reach) * kw + reach - sc;
      const grow = (tr - r0) * size - c0;
      for (let tc = tc0; tc <= tc1; tc++) glow[grow + tc] += v * kernel[krow + tc];
    }
  }
  const sqm = new Float32Array(size * size);
  for (let i = 0; i < sqm.length; i++) sqm[i] = sqmFromGlow(glow[i], model.k);
  return { sqm, size, r0, c0 };
}

export function cellCenter(region, r, c) {
  return { lat: region.south + (r + 0.5) * region.cellLat, lon: region.west + (c + 0.5) * region.cellLon };
}

export function sqmAt(sky, region, lat, lon) {
  const r = Math.floor((lat - region.south) / region.cellLat) - sky.r0;
  const c = Math.floor((lon - region.west) / region.cellLon) - sky.c0;
  if (r < 0 || c < 0 || r >= sky.size || c >= sky.size) return null;
  return sky.sqm[r * sky.size + c];
}

// Candidate dark spots: the nearest qualifying cells (kept apart from each other) plus the darkest ones.
// Straight-line distance only; drive times come later from a router.
export function candidateSites(sky, region, { maxBortle = 3, maxKm = region.searchKm, spacingKm = 15, nearest = 9, darkest = 4 } = {}) {
  const all = [];
  for (let r = 0; r < sky.size; r++) for (let c = 0; c < sky.size; c++) {
    const sqm = sky.sqm[r * sky.size + c];
    const p = cellCenter(region, r + sky.r0, c + sky.c0);
    const km = haversineKm(region.lat, region.lon, p.lat, p.lon);
    if (km > maxKm) continue;
    all.push({ ...p, sqm, bortle: bortleOf(sqm), km });
  }
  const ok = all.filter((s) => s.bortle <= maxBortle);
  const pick = (list, n, chosen) => {
    for (const s of list) {
      if (chosen.length >= n) break;
      if (chosen.every((t) => haversineKm(s.lat, s.lon, t.lat, t.lon) >= spacingKm)) chosen.push(s);
    }
    return chosen;
  };
  const near = pick([...ok].sort((a, b) => a.km - b.km), nearest, []);
  const dark = pick([...ok].sort((a, b) => b.sqm - a.sqm || a.km - b.km), near.length + darkest, [...near]);
  const best = [...all].sort((a, b) => b.sqm - a.sqm)[0] || null;
  return { sites: dark, darkestAnywhere: best, here: all.reduce((m, s) => (s.km < m.km ? s : m), all[0] || null) };
}
