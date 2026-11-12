# Moon Shot Planner

Day 6 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/006-moon-shot-planner/

## Plan (as built)
- **Main flow:** pick a landmark (or tap any spot on the map) → choose how far back to stand → get every moonrise in the next 60 days where the moon's centre sits right on the landmark's top, ranked, with the exact standing spot drawn on a map.
- **Data:** moon and sun positions from [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19, computed in the browser. Map tiles from OpenStreetMap. Landmark heights are a small bundled list (`landmarks.js`). Free and keyless.
- **Reuse:** nothing copied from earlier projects; the page layout and Leaflet setup follow Day 5.
- **Out of scope:** terrain and buildings between you and the landmark, checking whether the spot is on land or public, landmark search by name, calendar export.

## How it works
`plan.js` does the geometry and has no DOM code:
1. The landmark's top, seen from distance `d`, is at elevation `atan((h − eye − curvature drop) / d)`, using a 1.6 m eye height and the usual 0.13 refraction coefficient for the drop.
2. For each day, `SearchAltitude` finds when the moon's centre climbs (or sinks, in "Setting" mode) to that elevation. Astronomy Engine searches geometric altitude, so the target is corrected with `InverseRefraction` first: refraction lifts a 4° moon by about 0.18°, which is a third of its width.
3. The standing spot is the landmark moved `d` metres in the opposite direction to the moon. Moon parallax is up to 1°, so the search is repeated twice from the new spot until it settles.
4. Each moment gets a 0–100 score: moon brightness times a light factor that favours golden hour and twilight (sky still has colour, landmark isn't a black cutout) over daylight or full night.

The slider also shows the framing: how big the moon looks next to the landmark, and a rough full-frame lens that fits the landmark in about 70% of a portrait frame.

## Checks
`test/index.html` runs in the browser (open it from a local server). For 60 days of Golden Gate moonrises it checks, from each standing spot, that the moon is within 0.02° of the tower top and directly behind it, that spots are 3 km out, rises are about a day apart, and setting moons are in the west. It passes: 58 rises and 29 sets.

## Run it
```bash
cd /Users/august/code/ship100 && python3 -m http.server 8100
```
Then open http://localhost:8100/days/006-moon-shot-planner/

## Decisions made on the day
- Default landmark is the Transamerica Pyramid, not the Golden Gate Bridge: the best Golden Gate moonrise spot this month lands in the Pacific, while the Transamerica one lands near Alamo Square.
- Times show in the landmark's own time zone for presets, and the browser's time zone for a tapped spot.
- The test runs in the browser rather than Node, because this run wasn't allowed to execute the CDN library in Node.
- "Only when the moon is at least half lit" is on by default; thin crescents are hard to see near the horizon.

## What's next
- Land/water check for the standing spot (OpenStreetMap coastline data) and a nudge to the nearest reachable point.
- Terrain: use an elevation API so hills and the landmark's base height count.
- Search any building by name with heights from OpenStreetMap `height` tags.
- "Add to calendar" (.ics) for a chosen shot.
