// Orbit math for Starlink Train Alert (copied from Day 3, ISS Tonight).
// Ported from SatellitePaglu's Swift OrbitCore (Orbit/TLE.swift, SGP4.swift, Astro.swift, Tracker.swift),
// which is itself a port of Vallado's near-earth SGP4 as published in satellite.js.
// Plain ES module, no dependencies.

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

// ---------- vectors ----------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.sqrt(dot(a, a));

// ---------- time ----------
export const julianDate = (ms) => ms / 86400000 + 2440587.5;
export const msFromJulian = (jd) => (jd - 2440587.5) * 86400000;

function julianDateYMD(y, m, d) {
  return 367 * y - Math.floor(7 * (y + Math.floor((m + 9) / 12)) * 0.25)
    + Math.floor(275 * m / 9) + d + 1721013.5;
}

/** Greenwich mean sidereal time in radians (IAU-82, as used with SGP4). */
export function gmst(jd) {
  const t = (jd - 2451545.0) / 36525.0;
  let temp = -6.2e-6 * t * t * t + 0.093104 * t * t + (876600.0 * 3600 + 8640184.812866) * t + 67310.54841;
  temp = (temp * DEG / 240.0) % TWO_PI;
  if (temp < 0) temp += TWO_PI;
  return temp;
}

// ---------- TLE ----------
function expField(s) {
  let str = s.trim();
  if (!str) return 0;
  let sign = 1;
  if (str[0] === "-") { sign = -1; str = str.slice(1); } else if (str[0] === "+") str = str.slice(1);
  if (str.length < 2) return sign * Number(str);
  const e = Number(str.slice(-2).replace("+", ""));
  const m = Number("0." + str.slice(0, -2).trim());
  if (!Number.isFinite(e) || !Number.isFinite(m)) return NaN;
  return sign * m * Math.pow(10, e);
}

/** Parses one two-line element set. Returns null if it is malformed. */
export function parseTLE(name, line1, line2) {
  line1 = line1.trimEnd(); line2 = line2.trimEnd();
  if (line1.length < 64 || line2.length < 63 || !line1.startsWith("1 ") || !line2.startsWith("2 ")) return null;
  const f = (l, a, b) => l.slice(a, b).trim();
  const year2 = Number(f(line1, 18, 20));
  const tle = {
    name: name.trim(),
    noradID: Number(f(line1, 2, 7)),
    line1, line2,
    epochJD: julianDateYMD(year2 < 57 ? 2000 + year2 : 1900 + year2, 1, 1) + Number(f(line1, 20, 32)) - 1,
    bstar: expField(f(line1, 53, 61)),
    inclination: Number(f(line2, 8, 16)),
    raan: Number(f(line2, 17, 25)),
    eccentricity: Number("0." + f(line2, 26, 33)),
    argumentOfPerigee: Number(f(line2, 34, 42)),
    meanAnomaly: Number(f(line2, 43, 51)),
    meanMotion: Number(f(line2, 52, 63)),
  };
  return Object.values(tle).every((v) => typeof v === "string" || Number.isFinite(v)) ? tle : null;
}

/**
 * Turns one CelesTrak OMM JSON record (FORMAT=json) into the same shape parseTLE returns.
 * Needed because CelesTrak's TLE text can't hold catalog numbers above 69999, and every new
 * Starlink has one. Returns null if a field is missing.
 */
export function parseOMM(o) {
  const ms = Date.parse(/Z$/.test(o?.EPOCH || "") ? o.EPOCH : o?.EPOCH + "Z");
  const tle = {
    name: String(o?.OBJECT_NAME || "").trim(),
    noradID: Number(o?.NORAD_CAT_ID),
    intlDes: String(o?.OBJECT_ID || ""),
    epochJD: julianDate(ms),
    bstar: Number(o?.BSTAR),
    inclination: Number(o?.INCLINATION),
    raan: Number(o?.RA_OF_ASC_NODE),
    eccentricity: Number(o?.ECCENTRICITY),
    argumentOfPerigee: Number(o?.ARG_OF_PERICENTER),
    meanAnomaly: Number(o?.MEAN_ANOMALY),
    meanMotion: Number(o?.MEAN_MOTION),
    revAtEpoch: Number(o?.REV_AT_EPOCH) || 0,
  };
  return Object.values(tle).every((v) => typeof v === "string" || Number.isFinite(v)) ? tle : null;
}

/** Parses CelesTrak's 3-line text (name, line 1, line 2). Returns the first element set. */
export function parseTLEText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("1 ") && lines[i + 1]?.startsWith("2 ")) {
      const name = i > 0 && !lines[i - 1].startsWith("2 ") ? lines[i - 1] : "NORAD " + lines[i].slice(2, 7).trim();
      return parseTLE(name, lines[i], lines[i + 1]);
    }
  }
  return null;
}

// ---------- SGP4 (near-earth, WGS-72) ----------
const MU = 398600.8;
const RE = 6378.135;
const XKE = 60.0 / Math.sqrt(RE * RE * RE / MU);
const VKMPERSEC = RE * XKE / 60.0;
const J2 = 0.001082616, J3 = -0.00000253881, J4 = -0.00000165597;
const J3OJ2 = J3 / J2;
const X2O3 = 2 / 3;

/** Builds a propagator. Returns null for deep-space orbits (period ≥ 225 min) or bad elements. */
export function sgp4init(tle) {
  const s = {
    epochJD: tle.epochJD, bstar: tle.bstar, ecco: tle.eccentricity,
    argpo: tle.argumentOfPerigee * DEG, inclo: tle.inclination * DEG,
    mo: tle.meanAnomaly * DEG, nodeo: tle.raan * DEG,
    isimp: false, aycof: 0, con41: 0, cc1: 0, cc4: 0, cc5: 0, d2: 0, d3: 0, d4: 0, delmo: 0, eta: 0,
    argpdot: 0, omgcof: 0, sinmao: 0, t2cof: 0, t3cof: 0, t4cof: 0, t5cof: 0,
    x1mth2: 0, x7thm1: 0, mdot: 0, nodedot: 0, xlcof: 0, xmcof: 0, nodecf: 0, no: 0,
  };
  const xno = tle.meanMotion / (1440.0 / TWO_PI);
  const { ecco, inclo, argpo, mo, bstar } = s;
  if (!(ecco >= 0 && ecco < 1) || !(xno > 0)) return null;

  const eccsq = ecco * ecco;
  const omeosq = 1 - eccsq;
  const rteosq = Math.sqrt(omeosq);
  const cosio = Math.cos(inclo);
  const cosio2 = cosio * cosio;
  const ak = Math.pow(XKE / xno, X2O3);
  const d1 = 0.75 * J2 * (3 * cosio2 - 1) / (rteosq * omeosq);
  let delPrime = d1 / (ak * ak);
  const adel = ak * (1 - delPrime * delPrime - delPrime * (1 / 3 + 134 * delPrime * delPrime / 81));
  delPrime = d1 / (adel * adel);
  const no = xno / (1 + delPrime);
  s.no = no;
  const ao = Math.pow(XKE / no, X2O3);
  const sinio = Math.sin(inclo);
  const po = ao * omeosq;
  const con42 = 1 - 5 * cosio2;
  s.con41 = -con42 - cosio2 - cosio2;
  const posq = po * po;
  const rp = ao * (1 - ecco);

  if (TWO_PI / no >= 225) return null;

  const ss = 78 / RE + 1;
  const qzms2ttemp = (120 - 78) / RE;
  const qzms2t = qzms2ttemp ** 4;
  s.isimp = rp < 220 / RE + 1;

  let sfour = ss, qzms24 = qzms2t;
  const perige = (rp - 1) * RE;
  if (perige < 156) {
    sfour = perige - 78;
    if (perige < 98) sfour = 20;
    qzms24 = ((120 - sfour) / RE) ** 4;
    sfour = sfour / RE + 1;
  }
  const pinvsq = 1 / posq;
  const tsi = 1 / (ao - sfour);
  s.eta = ao * ecco * tsi;
  const eta = s.eta;
  const etasq = eta * eta;
  const eeta = ecco * eta;
  const psisq = Math.abs(1 - etasq);
  const coef = qzms24 * Math.pow(tsi, 4);
  const coef1 = coef / Math.pow(psisq, 3.5);
  const cc2 = coef1 * no * (ao * (1 + 1.5 * etasq + eeta * (4 + etasq))
    + 0.375 * J2 * tsi / psisq * s.con41 * (8 + 3 * etasq * (8 + etasq)));
  s.cc1 = bstar * cc2;
  let cc3 = 0;
  if (ecco > 1e-4) cc3 = -2 * coef * tsi * J3OJ2 * no * sinio / ecco;
  s.x1mth2 = 1 - cosio2;
  s.cc4 = 2 * no * coef1 * ao * omeosq * (eta * (2 + 0.5 * etasq) + ecco * (0.5 + 2 * etasq)
    - J2 * tsi / (ao * psisq) * (-3 * s.con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta))
    + 0.75 * s.x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * argpo)));
  s.cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
  const cosio4 = cosio2 * cosio2;
  const temp1 = 1.5 * J2 * pinvsq * no;
  const temp2 = 0.5 * temp1 * J2 * pinvsq;
  const temp3 = -0.46875 * J4 * pinvsq * pinvsq * no;
  s.mdot = no + 0.5 * temp1 * rteosq * s.con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4);
  s.argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4)
    + temp3 * (3 - 36 * cosio2 + 49 * cosio4);
  const xhdot1 = -temp1 * cosio;
  s.nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio;
  s.omgcof = bstar * cc3 * Math.cos(argpo);
  if (ecco > 1e-4) s.xmcof = -X2O3 * coef * bstar / eeta;
  s.nodecf = 3.5 * omeosq * xhdot1 * s.cc1;
  s.t2cof = 1.5 * s.cc1;
  s.xlcof = -0.25 * J3OJ2 * sinio * (3 + 5 * cosio) / (Math.abs(cosio + 1) > 1.5e-12 ? 1 + cosio : 1.5e-12);
  s.aycof = -0.5 * J3OJ2 * sinio;
  s.delmo = (1 + eta * Math.cos(mo)) ** 3;
  s.sinmao = Math.sin(mo);
  s.x7thm1 = 7 * cosio2 - 1;

  if (!s.isimp) {
    const cc1sq = s.cc1 * s.cc1;
    s.d2 = 4 * ao * tsi * cc1sq;
    const temp = s.d2 * tsi * s.cc1 / 3;
    s.d3 = (17 * ao + sfour) * temp;
    s.d4 = 0.5 * temp * ao * tsi * (221 * ao + 31 * sfour) * s.cc1;
    s.t3cof = s.d2 + 2 * cc1sq;
    s.t4cof = 0.25 * (3 * s.d3 + s.cc1 * (12 * s.d2 + 10 * cc1sq));
    s.t5cof = 0.2 * (3 * s.d4 + 12 * s.cc1 * s.d3 + 6 * s.d2 * s.d2 + 15 * cc1sq * (2 * s.d2 + cc1sq));
  }
  return s;
}

/** Propagates to `t` minutes after epoch. Returns TEME {position, velocity} in km and km/s, or null. */
export function propagate(s, t) {
  const xmdf = s.mo + s.mdot * t;
  const argpdf = s.argpo + s.argpdot * t;
  const nodedf = s.nodeo + s.nodedot * t;
  let argpm = argpdf, mm = xmdf;
  const t2 = t * t;
  let nodem = nodedf + s.nodecf * t2;
  let tempa = 1 - s.cc1 * t;
  let tempe = s.bstar * s.cc4 * t;
  let templ = s.t2cof * t2;

  if (!s.isimp) {
    const delomg = s.omgcof * t;
    const delm = s.xmcof * ((1 + s.eta * Math.cos(xmdf)) ** 3 - s.delmo);
    const temp = delomg + delm;
    mm = xmdf + temp;
    argpm = argpdf - temp;
    const t3 = t2 * t, t4 = t3 * t;
    tempa = tempa - s.d2 * t2 - s.d3 * t3 - s.d4 * t4;
    tempe += s.bstar * s.cc5 * (Math.sin(mm) - s.sinmao);
    templ = templ + s.t3cof * t3 + t4 * (s.t4cof + t * s.t5cof);
  }

  let nm = s.no;
  let em = s.ecco;
  const inclm = s.inclo;
  if (nm <= 0) return null;
  const am = Math.pow(XKE / nm, X2O3) * tempa * tempa;
  nm = XKE / Math.pow(am, 1.5);
  em -= tempe;
  if (em >= 1 || em < -0.001) return null;
  if (em < 1e-6) em = 1e-6;

  mm += s.no * templ;
  let xlm = mm + argpm + nodem;
  nodem %= TWO_PI;
  argpm %= TWO_PI;
  xlm %= TWO_PI;
  mm = (xlm - argpm - nodem) % TWO_PI;

  const sinip = Math.sin(inclm), cosip = Math.cos(inclm);
  const ep = em, argpp = argpm, nodep = nodem, mp = mm;

  const axnl = ep * Math.cos(argpp);
  let temp = 1 / (am * (1 - ep * ep));
  const aynl = ep * Math.sin(argpp) + temp * s.aycof;
  const xl = mp + argpp + nodep + temp * s.xlcof * axnl;

  const u = (xl - nodep) % TWO_PI;
  let eo1 = u, tem5 = 9999.9, ktr = 1, sineo1 = 0, coseo1 = 0;
  while (Math.abs(tem5) >= 1e-12 && ktr <= 10) {
    sineo1 = Math.sin(eo1);
    coseo1 = Math.cos(eo1);
    tem5 = 1 - coseo1 * axnl - sineo1 * aynl;
    tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5;
    if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95;
    eo1 += tem5;
    ktr++;
  }

  const ecose = axnl * coseo1 + aynl * sineo1;
  const esine = axnl * sineo1 - aynl * coseo1;
  const el2 = axnl * axnl + aynl * aynl;
  const pl = am * (1 - el2);
  if (pl < 0) return null;
  const rl = am * (1 - ecose);
  const rdotl = Math.sqrt(am) * esine / rl;
  const rvdotl = Math.sqrt(pl) / rl;
  const betal = Math.sqrt(1 - el2);
  temp = esine / (1 + betal);
  const sinu = am / rl * (sineo1 - aynl - axnl * temp);
  const cosu = am / rl * (coseo1 - axnl + aynl * temp);
  let su = Math.atan2(sinu, cosu);
  const sin2u = (cosu + cosu) * sinu;
  const cos2u = 1 - 2 * sinu * sinu;
  temp = 1 / pl;
  const temp1 = 0.5 * J2 * temp;
  const temp2 = temp1 * temp;

  const mrt = rl * (1 - 1.5 * temp2 * betal * s.con41) + 0.5 * temp1 * s.x1mth2 * cos2u;
  if (mrt < 1) return null;
  su -= 0.25 * temp2 * s.x7thm1 * sin2u;
  const xnode = nodep + 1.5 * temp2 * cosip * sin2u;
  const xinc = inclm + 1.5 * temp2 * cosip * sinip * cos2u;
  const mvt = rdotl - nm * temp1 * s.x1mth2 * sin2u / XKE;
  const rvdot = rvdotl + nm * temp1 * (s.x1mth2 * cos2u + 1.5 * s.con41) / XKE;

  const sinsu = Math.sin(su), cossu = Math.cos(su);
  const snod = Math.sin(xnode), cnod = Math.cos(xnode);
  const sini = Math.sin(xinc), cosi = Math.cos(xinc);
  const xmx = -snod * cosi, xmy = cnod * cosi;
  const ux = xmx * sinsu + cnod * cossu, uy = xmy * sinsu + snod * cossu, uz = sini * sinsu;
  const vx = xmx * cossu - cnod * sinsu, vy = xmy * cossu - snod * sinsu, vz = sini * cossu;

  return {
    position: { x: mrt * ux * RE, y: mrt * uy * RE, z: mrt * uz * RE },
    velocity: {
      x: (mvt * ux + rvdot * vx) * VKMPERSEC,
      y: (mvt * uy + rvdot * vy) * VKMPERSEC,
      z: (mvt * uz + rvdot * vz) * VKMPERSEC,
    },
  };
}

// ---------- observer geometry ----------
export const eciToEcf = (r, g) => {
  const c = Math.cos(g), s = Math.sin(g);
  return { x: r.x * c + r.y * s, y: -r.x * s + r.y * c, z: r.z };
};

export function observerEcf(o) {
  const a = 6378.137, b = 6356.7523142;
  const f = (a - b) / a, e2 = 2 * f - f * f;
  const lat = o.latitude * DEG, lon = o.longitude * DEG;
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const h = o.altitude || 0;
  return {
    x: (n + h) * Math.cos(lat) * Math.cos(lon),
    y: (n + h) * Math.cos(lat) * Math.sin(lon),
    z: (n * (1 - e2) + h) * Math.sin(lat),
  };
}

/** Azimuth (deg from N, clockwise), elevation (deg) and range (km) from observer to an ECF point. */
export function lookAngles(o, oe, t) {
  const lat = o.latitude * DEG, lon = o.longitude * DEG;
  const d = sub(t, oe);
  const sLat = Math.sin(lat), cLat = Math.cos(lat), sLon = Math.sin(lon), cLon = Math.cos(lon);
  const south = sLat * cLon * d.x + sLat * sLon * d.y - cLat * d.z;
  const east = -sLon * d.x + cLon * d.y;
  const up = cLat * cLon * d.x + cLat * sLon * d.y + sLat * d.z;
  const range = Math.sqrt(south * south + east * east + up * up);
  let az = Math.atan2(-east, south) + Math.PI;
  if (az >= TWO_PI) az -= TWO_PI;
  return { azimuth: az / DEG, elevation: Math.asin(up / range) / DEG, range };
}

/** Low-precision Sun position (Astronomical Almanac), equatorial of date, km. */
export function sunPosition(jd) {
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const km = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * 149597870.7;
  return { x: km * Math.cos(lambda), y: km * Math.cos(eps) * Math.sin(lambda), z: km * Math.sin(eps) * Math.sin(lambda) };
}

/** True when a satellite at ECI `r` is in sunlight (cylindrical Earth shadow). */
export function isSunlit(r, sun) {
  const sHat = scale(sun, 1 / len(sun));
  const along = dot(r, sHat);
  if (along > 0) return true;
  return len(sub(r, scale(sHat, along))) > 6371.0;
}

export function compassPoint(az) {
  const pts = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return pts[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

// ---------- one instant ----------
/** Everything about the satellite as seen from `obs` at time `ms`. */
export function observe(sat, obs, oe, ms) {
  const jd = julianDate(ms);
  const st = propagate(sat, (jd - sat.epochJD) * 1440);
  if (!st) return null;
  const g = gmst(jd);
  const look = lookAngles(obs, oe, eciToEcf(st.position, g));
  const sun = sunPosition(jd);
  const sunEl = lookAngles(obs, oe, eciToEcf(sun, g)).elevation;
  const sunlit = isSunlit(st.position, sun);
  // Observer position in ECI, for the phase angle used in the brightness estimate.
  const c = Math.cos(g), s = Math.sin(g);
  const oEci = { x: oe.x * c - oe.y * s, y: oe.x * s + oe.y * c, z: oe.z };
  const toSun = sub(sun, st.position), toObs = sub(oEci, st.position);
  const phase = Math.acos(Math.max(-1, Math.min(1, dot(toSun, toObs) / (len(toSun) * len(toObs)))));
  return { ...look, sunEl, sunlit, phase, visible: look.elevation > 0 && sunlit && sunEl < -6 };
}

/**
 * Rough visual magnitude (McCants' method): standard magnitude at 1000 km and half phase,
 * adjusted for range and for the phase angle with a diffuse-sphere model. ISS standard magnitude ≈ -1.8.
 */
export function magnitude(range, phase, standard = -1.8) {
  const f = Math.sin(phase) + (Math.PI - phase) * Math.cos(phase);
  return standard + 5 * Math.log10(range / 1000) - 2.5 * Math.log10(Math.max(f, 1e-3));
}

// ---------- passes ----------
/**
 * Finds passes from `startMs` over `days`. Each pass has rise/set and, when part of it can be seen
 * with the naked eye (satellite sunlit, sky darker than civil twilight), a `visible` segment with its
 * start/end/peak times, directions, elevations and an estimated brightest magnitude.
 */
export function findPasses(sat, obs, startMs, days = 10, standardMag = -1.8) {
  const oe = observerEcf(obs);
  const step = 20000;
  const endMs = startMs + days * 86400000;
  const el = (ms) => observe(sat, obs, oe, ms)?.elevation ?? -90;
  const vis = (ms) => observe(sat, obs, oe, ms)?.visible ?? false;
  // Binary search for where `pred` flips between a and b. Returns the time on the side
  // where pred is true, so a rise is always "up" and a set is the last "up" moment.
  const edge = (a, b, pred) => {
    const pa = pred(a);
    for (let i = 0; i < 14; i++) {
      const m = (a + b) / 2;
      if (pred(m) === pa) a = m; else b = m;
    }
    return pa ? a : b;
  };
  const up = (ms) => el(ms) > 0;

  const passes = [];
  let t = startMs;
  // If it's already up, step back to the rise so the current pass is complete.
  if (up(t)) { let back = t; while (up(back) && t - back < 3 * 3600000) back -= step; t = back; }

  let prevUp = up(t);
  for (; t < endMs; t += step) {
    const n = t + step;
    const nUp = up(n);
    if (!prevUp && nUp) {
      const rise = edge(t, n, up);
      // Walk the pass.
      const samples = [];
      let u = rise;
      while (up(u) && u - rise < 30 * 60000) {
        samples.push({ ms: u, ...observe(sat, obs, oe, u) });
        u += 5000;
      }
      const set = edge(u - 5000, u, up);
      samples.push({ ms: set, ...observe(sat, obs, oe, set) });
      const peak = samples.reduce((a, b) => (b.elevation > a.elevation ? b : a));
      const pass = { rise, set, peak, riseAz: samples[0].azimuth, setAz: samples.at(-1).azimuth, track: samples, visible: null };

      const vi = samples.findIndex((x) => x.visible);
      if (vi >= 0) {
        let vj = samples.length - 1;
        while (!samples[vj].visible) vj--;
        const vStart = vi > 0 ? edge(samples[vi - 1].ms, samples[vi].ms, vis) : samples[vi].ms;
        const vEnd = vj < samples.length - 1 ? edge(samples[vj].ms, samples[vj + 1].ms, vis) : samples[vj].ms;
        const visSamples = samples.slice(vi, vj + 1);
        const vPeak = visSamples.reduce((a, b) => (b.elevation > a.elevation ? b : a));
        const a = observe(sat, obs, oe, vStart), b = observe(sat, obs, oe, vEnd);
        const mag = Math.min(...visSamples.map((x) => magnitude(x.range, x.phase, standardMag)));
        pass.visible = {
          start: vStart, end: vEnd, peak: vPeak,
          startAz: a.azimuth, startEl: Math.max(0, a.elevation),
          endAz: b.azimuth, endEl: Math.max(0, b.elevation),
          magnitude: mag,
          // Where in the sky it vanishes: into Earth's shadow, or below the horizon.
          fadesInShadow: vj < samples.length - 1 && !samples[vj + 1].sunlit,
        };
      }
      passes.push(pass);
      t = set;
      prevUp = false;
      continue;
    }
    prevUp = nUp;
  }
  return passes;
}
