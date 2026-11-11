# Dark Sky Finder

Day 5 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/005-dark-sky-finder/

## Plan (as built)
- **Main flow:** enter a city or US ZIP code (or use your location, or tap the map) → see your own sky's Bortle class → see the nearest Bortle 1–3 spots you can drive to within an hour, on a shaded light-pollution map, with directions.
- **Data:** NASA VIIRS Black Marble 2016 night lights from GIBS, fed through AstroScout's sky-glow model in the browser. Drive times from the OSRM demo router. City search from Open-Meteo, ZIP codes from Zippopotam.us, map tiles from OpenStreetMap. All free and keyless.
- **Reuse:** AstroScout's light-pollution pipeline (`tools/build_light_pollution_grid.py`) and Bortle thresholds (`LightPollution.swift`), ported to JavaScript in `sky.js`. The place search follows Day 4's.
- **Out of scope:** tonight's clouds and Moon (Day 2's Milky Way Calendar covers dates), terrain blocking light domes, a curated list of official dark-sky parks.

## How it works
`sky.js` runs the same steps as AstroScout's grid builder, for about 250 km around the chosen place:
1. Download the Black Marble image for the area (one WMS request, about 450×450 px, ~2 s).
2. Average it into 3.3 km cells and estimate each cell's upward light. Black Marble is a tone-mapped picture, not radiance, so the dim blue of unlit land is subtracted and a power curve undoes the tone mapping.
3. Spread every lit cell's light over everything within 150 km with a distance kernel `d^-p`.
4. Zenith brightness `SQM = 22.0 − 2.5·log10(1 + k·glow)`, then AstroScout's SQM → Bortle table.
5. Pick candidate cells of Bortle 3 or darker within 100 km (the nearest ones, kept 15 km apart, plus the darkest), ask OSRM for drive times in one table request, move each spot to its nearest road point if that's still dark, and keep the ones within an hour.

If no Bortle 1–3 sky exists within 100 km, the page says so and shows the darkest class that does.

### Calibration
`tools/calibrate.mjs` downloads the same images for 14 reference places (Midtown Manhattan, Las Vegas Strip, SF, Fresno, suburbs, Lick Observatory, Pinnacles, Yosemite Valley, Death Valley, Great Basin, Big Bend, Cherry Springs, Flagstaff) and grid-searches the three constants. Result: `gamma 6.75, k 0.891, p 1.8`, rms error 0.26 mag, every site within one Bortle class.

The reference SQM values are ballpark figures from published measurements and the 2015 World Atlas, written from memory rather than looked up one by one. Good enough to set the scale; worth checking against real SQM readings before anyone relies on the exact numbers.

## Run it
Serve the repo root and open the folder:
```bash
python3 -m http.server 8100
# http://localhost:8100/days/005-dark-sky-finder/
```
Tests (Node 18+): `node days/005-dark-sky-finder/test/sky.test.mjs`. They check the Bortle table, the pixel-to-light step on real Black Marble background colours, a synthetic city's glow falling off with distance, and candidate selection.
Recalibrate (needs network): `node days/005-dark-sky-finder/tools/calibrate.mjs`.

Share a place with `?lat=…&lon=…&name=…` (the "Copy link" button builds it).

## Decisions made during the unattended build
- **The "AstroScout grid" didn't exist as a file.** AstroScout has the grid format and a builder script, but the builder needs an annual VIIRS GeoTIFF from NOAA's Earth Observation Group, which requires an account, and the app was still using its city-population fallback. So the page runs the builder's method live in the browser on NASA's keyless Black Marble imagery instead, and the constants were fitted rather than copied.
- **Two constants became three.** With AstroScout's fixed `r^-2.5` kernel, the best fit was poor (rms 0.47 mag, suburbs too bright and parks too dark). Fitting the exponent too (it came out 1.8) halved the error.
- **"Within an hour's drive"** = OSRM drive time ≤ 60 min to the nearest road point, among candidates up to 100 km away in a straight line. If OSRM doesn't answer, times are estimated from distance and labeled "about".
- **Example place:** first visits open on San Jose, CA so the page isn't empty. After that it remembers the last place in `localStorage`.
- **Map:** Leaflet 1.9.4 from unpkg (pinned), OSM tiles (inverted in dark mode), Bortle shading as an image overlay, optional NASA night-lights layer.
- **Found an untracked `100-days-100-products.md` in the repo root** with personal background notes. Left it alone and out of the commits.

## What's next
- A precomputed world grid in AstroScout's `ASLP` format, built from real VIIRS radiance (needs the EOG download), so AstroScout and this page share one file.
- Tonight's cloud cover and Moon for each spot (Open-Meteo plus Day 2's moon code).
- Terrain: a ridge between you and a city blocks a lot of its glow.
- Official International Dark Sky Places as a map layer.
