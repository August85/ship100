// Visibility logic for Rocket Launch Feed. No DOM code, no imports:
// the astronomy library (astronomy-engine) is passed in so tests can run it from the same CDN.

export const EARTH_R = 6371; // km

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (b) => POINTS[Math.round(b / 22.5) % 16];

/** Elevation angle (degrees) of a point h km straight above a spot d km away, allowing for Earth's curve. */
export function elevationDeg(hKm, dKm) {
  if (dKm < 0.01) return 90;
  return deg(Math.atan2(hKm - (dKm * dKm) / (2 * EARTH_R), dKm));
}

/** How deep the sun can be below the horizon (degrees) and still light something h km up. */
export const sunlitDip = (hKm) => deg(Math.acos(EARTH_R / (EARTH_R + hKm)));

/** Sun altitude in degrees (no refraction) at a place and time. */
export function sunAltitude(A, lat, lon, date) {
  const obs = new A.Observer(lat, lon, 0);
  const eq = A.Equator(A.Body.Sun, date, obs, true, true);
  return A.Horizon(date, obs, eq.ra, eq.dec, null).altitude;
}

/** Only launches with a time to the minute or hour can be judged. */
export const hasTime = (l) => ["SEC", "MIN", "HR"].includes(l.precision);

const PLUME_KM = 150; // upper stage height a few minutes after liftoff; the "jellyfish" lives up here

/**
 * Judge how a launch will look from one place.
 * launch: { net, lat, lon, precision }. from: { lat, lon }.
 * Returns { rating: great|good|fair|poor|unknown, kind, headline, tip, distKm, bearing, look, plumeEl, sunObs, sunPad }.
 */
export function judge(A, launch, from) {
  const distKm = distanceKm(from.lat, from.lon, launch.lat, launch.lon);
  const bearing = bearingDeg(from.lat, from.lon, launch.lat, launch.lon);
  const base = { distKm, bearing, look: compass(bearing), plumeEl: elevationDeg(PLUME_KM, distKm), flameEl: elevationDeg(60, distKm) };
  if (!hasTime(launch)) {
    return { ...base, rating: "unknown", kind: "tbd", headline: "Time not set yet", tip: "Check back once a launch time is announced." };
  }
  const t = new Date(launch.net);
  const sunObs = sunAltitude(A, from.lat, from.lon, t);
  const sunPad = sunAltitude(A, launch.lat, launch.lon, t);
  const out = { ...base, sunObs, sunPad };
  const darkSky = sunObs < -4;
  const plumeLit = sunPad > -sunlitDip(PLUME_KM) + 1; // keep a 1° margin; the plume spreads and drifts

  if (darkSky && plumeLit) {
    // The famous twilight plume: you're in shadow, the exhaust up high still catches the sun.
    if (base.plumeEl > 5) return { ...out, rating: "great", kind: "twilight", headline: "Twilight plume likely", tip: "You're in the dark while the exhaust high up is still sunlit. Expect a glowing, spreading plume. Watch for 5–10 minutes." };
    if (base.plumeEl > 1) return { ...out, rating: "good", kind: "twilight", headline: "Twilight plume, low on the horizon", tip: "The lit plume should clear your horizon, but only just. Find a spot with a clear, low view." };
    return { ...out, rating: "poor", kind: "twilight", headline: "Too far away", tip: "Twilight plume, but it stays below your horizon from here." };
  }
  if (darkSky) {
    if (base.flameEl > 8) return { ...out, rating: "good", kind: "night", headline: "Night launch: bright engine flame", tip: "Look for a bright orange point climbing fast, then a fading star as it heads downrange. Stage separation may show as a flash." };
    if (base.flameEl > 1.5) return { ...out, rating: "fair", kind: "night", headline: "Night launch: low, distant flame", tip: "A moving point of light low on the horizon for a couple of minutes. A clear horizon helps." };
    return { ...out, rating: "poor", kind: "night", headline: "Too far away", tip: "The engine flame stays below your horizon from here." };
  }
  if (distKm < 60) return { ...out, rating: "good", kind: "day", headline: "Daytime launch: close enough to see", tip: "In daylight you'll see the flame and a white trail if it's clear. You may hear it a minute or two later." };
  if (distKm < 160) return { ...out, rating: "fair", kind: "day", headline: "Daytime launch: look for a contrail", tip: "From this far in daylight, you're looking for a thin white trail climbing in the distance." };
  return { ...out, rating: "poor", kind: "day", headline: "Daytime launch: not visible from here", tip: "Daylight hides it at this distance. Watch the webcast instead." };
}

/** iCalendar text for one launch. */
export function icsFor(launch, extra = "") {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(launch.net), end = new Date(start.getTime() + 30 * 60000);
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ship 100//Rocket Launch Feed//EN", "BEGIN:VEVENT",
    `UID:${launch.id}@ship100-rocket-launch-feed`, `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc("Launch: " + launch.name)}`,
    `LOCATION:${esc(`${launch.pad}, ${launch.location}`)}`,
    `DESCRIPTION:${esc((extra ? extra + "\n\n" : "") + "Launch times slip often. Check the feed again on the day.")}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

/** Keep only the fields the page uses (the same shape as snapshot.json). */
export function trimLaunch(x) {
  const m = x.mission || {}, p = x.pad || {};
  return {
    id: x.id, name: x.name, net: x.net, precision: x.net_precision?.abbrev || "MIN",
    windowStart: x.window_start, windowEnd: x.window_end,
    status: x.status?.abbrev || "", statusName: x.status?.name || "",
    provider: x.launch_service_provider?.name || "", rocket: x.rocket?.configuration?.full_name || "",
    mission: m.name || "", missionType: m.type || "", orbit: m.orbit?.name || "", description: m.description || "",
    pad: p.name || "", location: p.location?.name || "", lat: Number(p.latitude), lon: Number(p.longitude),
  };
}
