# ISS Tonight

Day 3 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/003-iss-tonight/

## Plan (as built)
- **Main flow:** pick a place (your location or a city search) → see the next pass you can see with the naked eye: when, where it appears, how high it gets, where it vanishes, how bright → "Remind me" downloads an .ics with a 10-minute alarm.
- **Data:** the ISS orbit (TLE) from CelesTrak, fetched in the browser (at most every 2 hours; falls back to a saved copy, then to the bundled `iss.tle`). City search from Open-Meteo's geocoder. Both are free and keyless.
- **Math:** SGP4, sun position, look angles and the shadow test are a JS port of SatellitePaglu's Swift `OrbitCore`, in `orbit.js`.
- **Out of scope:** weather/cloud cover, push notifications, other satellites, a live sky view.

## What's in it
- Next good pass card with a countdown, three plain steps ("Appears in the SSW… climbs to 15° up… fades into Earth's shadow"), height in fists at arm's length, a brightness rating, and a small sky map of the path (visible part in gold).
- A list of every visible pass in the next 10 days, each with its own .ics button.
- "Include low passes" shows passes that never get above 10°; they're hidden by default because trees and buildings usually block them.
- Switches to "Visible right now / Look up!" during a pass.
- Times are shown in the chosen place's time zone. The location stays in the browser (localStorage).

## How a pass is judged visible
The station is above the horizon, it's in sunlight (cylindrical Earth-shadow test), and the observer's sun is more than 6° below the horizon. Brightness uses McCants' method: standard magnitude −1.8 at 1,000 km, adjusted for range and phase angle. It's an estimate.

## Run it
Serve the repo root and open the folder:
```bash
python3 -m http.server 8100
# http://localhost:8100/days/003-iss-tonight/
```
Tests (Node 18+): `node days/003-iss-tonight/test/orbit.test.mjs`. They check the JS SGP4 port against the same reference vectors SatellitePaglu uses (satellite.js / Vallado), plus look angles, deep-space rejection and pass sanity.

## Decisions made during the unattended build
- Reused SatellitePaglu by porting its Swift orbit code to JS rather than pulling satellite.js from a CDN, so the "reuses SatellitePaglu" promise holds and there's no dependency.
- Pass search covers 10 days in 20-second steps (about 40 ms in the browser), then refines each edge by bisection.
- "Good" pass = visible part reaches at least 10°.
- The sky map uses map orientation (north up, east right).

## What's next
- Cloud cover for each pass from Open-Meteo.
- Tiangong and other bright satellites.
- A "subscribe" calendar feed instead of one-off .ics files.
