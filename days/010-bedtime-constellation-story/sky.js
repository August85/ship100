// Sky maths for Bedtime Constellation Story. Pure functions, no DOM, so test/ can import them.
// Accuracy target: a degree or so, which is plenty for "look north-east, halfway up".

const RAD = Math.PI / 180;

/** Days since J2000.0 (2000-01-01 12:00 UTC). */
export function daysSinceJ2000(date) {
  return date.getTime() / 86400000 - 10957.5;
}

/** Local sidereal time in hours (0..24) for a UTC instant and east longitude in degrees. */
export function localSiderealHours(date, lonDeg) {
  const d = daysSinceJ2000(date);
  const gmst = 18.697374558 + 24.06570982441908 * d;
  return mod(gmst + lonDeg / 15, 24);
}

/** Altitude and azimuth (degrees; azimuth from north through east) of a star at RA (hours), Dec (degrees). */
export function altAz(raHours, decDeg, date, latDeg, lonDeg) {
  const ha = (localSiderealHours(date, lonDeg) - raHours) * 15 * RAD;
  const dec = decDeg * RAD, lat = latDeg * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  const y = -Math.sin(ha) * Math.cos(dec);
  const x = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(ha);
  return { alt: alt / RAD, az: mod(Math.atan2(y, x) / RAD, 360) };
}

/** Low-precision Sun RA/Dec (good to ~1°). */
export function sunRaDec(date) {
  const d = daysSinceJ2000(date);
  const g = mod(357.529 + 0.98560028 * d, 360) * RAD;
  const q = mod(280.459 + 0.98564736 * d, 360);
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD / 15;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) / RAD;
  return { ra: mod(ra, 24), dec };
}

export function sunAltitude(date, lat, lon) {
  const s = sunRaDec(date);
  return altAz(s.ra, s.dec, date, lat, lon).alt;
}

/** East-North-Up unit vector for an alt/az. */
function enu(alt, az) {
  const a = alt * RAD, z = az * RAD;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

/**
 * Where a constellation is at a given instant: centre alt/az, share of stars above the horizon,
 * and each star projected onto a flat picture as you would see it facing that way (up = towards the zenith).
 */
export function placeConstellation(c, date, lat, lon) {
  const pos = c.stars.map((s) => altAz(s[1], s[2], date, lat, lon));
  const vecs = pos.map((p) => enu(p.alt, p.az));
  const centre = norm(vecs.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]));
  const alt = Math.asin(clamp(centre[2], -1, 1)) / RAD;
  const az = mod(Math.atan2(centre[0], centre[1]) / RAD, 360);
  // Picture axes: "up" is the zenith direction tipped into the picture plane; near the zenith use north.
  const zen = [0, 0, 1];
  let up = zen.map((v, i) => v - dot(zen, centre) * centre[i]);
  if (Math.hypot(...up) < 1e-3) up = [0, 1, 0].map((v, i) => v - dot([0, 1, 0], centre) * centre[i]);
  up = norm(up);
  const right = cross(centre, up);
  const points = vecs.map((v) => {
    const k = dot(v, centre) || 1e-6;
    return { x: dot(v, right) / k, y: dot(v, up) / k };
  });
  const above = pos.filter((p) => p.alt > 10).length / pos.length;
  return { alt, az, above, points, stars: pos };
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export function compassWord(az) {
  return COMPASS[Math.round(mod(az, 360) / 45) % 8];
}

export function heightWords(alt) {
  if (alt >= 70) return "almost straight up";
  if (alt >= 50) return "high up";
  if (alt >= 28) return "halfway up the sky";
  if (alt >= 12) return "low, just above the rooftops";
  return "right down by the horizon";
}

/** Score how good a constellation is to look at: 0 means not really visible. */
export function visibilityScore(place) {
  if (place.alt < 15 || place.above < 0.8) return 0;
  // Best between 35° and 75°; straight overhead is a neck-ache for small people.
  const a = place.alt;
  return a < 35 ? a / 35 : a <= 75 ? 1 : 1 - (a - 75) / 60;
}

/**
 * Pick tonight's story. Among the well-placed constellations, rotate by date so each night is different;
 * if none is well placed, fall back to whatever is highest.
 */
export function pickTonight(list, date, lat, lon, dayIndex) {
  const scored = list.map((c) => {
    const place = placeConstellation(c, date, lat, lon);
    return { c, place, score: visibilityScore(place) };
  });
  const good = scored.filter((s) => s.score >= 0.8);
  const visible = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  let pick;
  if (good.length) pick = good[mod(dayIndex, good.length)];
  else pick = visible[0] || scored.slice().sort((a, b) => b.place.alt - a.place.alt)[0];
  return { pick, visible, scored };
}

/** The UTC instant for a wall-clock time in an IANA time zone (falls back to the device zone). */
export function zonedInstant(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  if (!tz) return new Date(y, m - 1, d, hh, mm);
  let t = guess;
  for (let i = 0; i < 2; i++) t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

/** Today's calendar date (y, m, d) in a time zone. */
export function ymdIn(date, tz) {
  const parts = partsIn(date, tz);
  return { y: parts.year, m: parts.month, d: parts.day };
}

function tzOffsetMs(date, tz) {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function partsIn(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz || undefined, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** Day number used to rotate stories (days since 1970 in the given calendar date). */
export function dayIndexOf({ y, m, d }) {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function mod(a, n) { return ((a % n) + n) % n; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
