// Moon Shot Planner: the geometry. No DOM here, so it can be tested in Node.
// The astronomy library is passed in (astronomy-engine), so this file has no imports.

const R_EARTH = 6371008.8; // metres
const MOON_DIAMETER_DEG = 0.52; // average apparent diameter
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Point reached by walking `dist` metres from (lat, lon) on bearing `brg` degrees. */
export function destination(lat, lon, brg, dist) {
  const d = dist / R_EARTH, t = rad(brg), p1 = rad(lat), l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lon: ((deg(l2) + 540) % 360) - 180 };
}

/** Initial bearing from point 1 to point 2, degrees 0..360. */
export function bearing(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceM(lat1, lon1, lat2, lon2) {
  const dp = rad(lat2 - lat1), dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

/**
 * Apparent elevation angle (degrees) of the landmark's top seen from `dist` metres away,
 * with Earth's curvature (and the usual 0.13 refraction coefficient) taken off.
 */
export function topElevation(height, dist, eye = 1.6) {
  const drop = (dist * dist) / (2 * R_EARTH) * (1 - 0.13);
  return deg(Math.atan2(height - eye - drop, dist));
}

/** Rough full-frame focal length (mm) so the landmark fills ~70% of a portrait frame. */
export function suggestedFocal(elevDeg) {
  const t = Math.tan(rad(Math.max(elevDeg, 0.05)));
  return Math.round((0.7 * 36) / t);
}

/** How tall the moon looks next to the landmark, as a fraction of the landmark's height. */
export function moonToLandmark(elevDeg) {
  return MOON_DIAMETER_DEG / Math.max(elevDeg, 0.01);
}

export const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (b) => COMPASS[Math.round(((b % 360) + 360) % 360 / 22.5) % 16];

function lightLabel(sunAlt) {
  if (sunAlt > 6) return "daylight";
  if (sunAlt > -0.8) return "golden hour";
  if (sunAlt > -6) return "civil twilight";
  if (sunAlt > -12) return "blue hour";
  return "night";
}

/**
 * Score a moment for photography, 0..100. Best: a big bright moon in twilight,
 * when the sky still has colour and the landmark is not a black silhouette.
 */
function score(illum, sunAlt) {
  let light;
  if (sunAlt > 8) light = 0.25;            // pale moon in a bright sky
  else if (sunAlt > -0.8) light = 0.85;     // golden hour
  else if (sunAlt > -9) light = 1;          // twilight / blue hour: the sweet spot
  else if (sunAlt > -14) light = 0.7;
  else light = 0.45;                        // full night: moon blows out, landmark goes dark
  return Math.round(100 * light * (0.25 + 0.75 * illum));
}

/**
 * Find every time in the next `days` days when the moon's centre sits right on top of the
 * landmark, as seen from `dist` metres away, and where to stand for it.
 *
 * A: astronomy-engine module. lm: { lat, lon, height }. mode: "rise" or "set".
 */
export function planShots(A, lm, { dist = 3000, days = 60, mode = "rise", start = new Date() } = {}) {
  const elev = topElevation(lm.height, dist);
  if (!(elev > 0.05)) return { elev, shots: [] };
  const dir = mode === "set" ? -1 : +1;
  // SearchAltitude works without refraction, but the eye sees the refracted moon,
  // so search for the geometric altitude that refraction lifts to `elev`.
  const target = elev + A.InverseRefraction("normal", elev);
  const shots = [];
  let t = A.MakeTime(start);
  const end = t.AddDays(days);

  while (t.ut < end.ut) {
    // First guess: observer at the landmark itself.
    let obs = new A.Observer(lm.lat, lm.lon, 0);
    const hit = A.SearchAltitude(A.Body.Moon, obs, dir, t, end.ut - t.ut, target);
    if (!hit) break;

    // Moon parallax is up to ~1°, so move the observer to the standing spot and search again
    // a little before the first hit. Two passes settle to well under a second of time.
    let when = hit, spot, az = 0;
    for (let i = 0; i < 2; i++) {
      const hor = horizon(A, when, obs);
      az = hor.azimuth;
      spot = destination(lm.lat, lm.lon, (az + 180) % 360, dist);
      obs = new A.Observer(spot.lat, spot.lon, 0);
      const again = A.SearchAltitude(A.Body.Moon, obs, dir, when.AddDays(-0.1), 0.2, target);
      if (again) when = again;
    }
    az = horizon(A, when, obs).azimuth;
    spot = destination(lm.lat, lm.lon, (az + 180) % 360, dist);

    const illum = A.Illumination(A.Body.Moon, when).phase_fraction;
    const phaseAngle = A.MoonPhase(when); // 0 new, 90 first quarter, 180 full, 270 last quarter
    const sunHor = horizon(A, when, obs, A.Body.Sun);

    shots.push({
      date: when.date,
      azimuth: az,
      elevation: elev,
      stand: spot,
      facing: bearing(spot.lat, spot.lon, lm.lat, lm.lon),
      illum,
      phase: phaseName(phaseAngle),
      sunAlt: sunHor.altitude,
      light: lightLabel(sunHor.altitude),
      score: score(illum, sunHor.altitude),
    });
    t = when.AddDays(0.5); // the next rise is ~24.8 hours later
  }
  return { elev, shots };
}

function horizon(A, time, obs, body = A.Body.Moon) {
  const eq = A.Equator(body, time, obs, true, true);
  return A.Horizon(time, obs, eq.ra, eq.dec, "normal");
}

export function phaseName(a) {
  if (a < 10 || a >= 350) return "New moon";
  if (a < 80) return "Waxing crescent";
  if (a < 100) return "First quarter";
  if (a < 170) return "Waxing gibbous";
  if (a < 190) return "Full moon";
  if (a < 260) return "Waning gibbous";
  if (a < 280) return "Last quarter";
  return "Waning crescent";
}
