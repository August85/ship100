# Rocket Launch Feed

Day 8 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/008-rocket-launch-feed/

## Plan (as built)
- **Main flow:** pick your town (or use your location) → see the next Vandenberg launch with a countdown and a verdict for *your* sky (twilight plume, night flame, daytime, or not visible) → which way to look and how high → add it to your calendar → nearest viewing spots.
- **Data:** upcoming launches from [Launch Library 2](https://thespacedevs.com/llapi) (The Space Devs, free, keyless, CORS-enabled), filtered to Vandenberg SFB (location 11). Sun positions from [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 in the browser. Towns and viewing spots are a small bundled list (`spots.js`).
- **Reuse:** nothing copied from earlier projects. The Astronomy Engine import and the in-browser test page follow Day 6.
- **Out of scope:** weather and fog forecasts, launch trajectories per mission, webcasts, push notifications, launches from outside California.

## How the verdict works
`launch.js` has no DOM code. For a launch with a time to the minute or hour:
1. Sun altitude for you and for the pad at T-0.
2. **Twilight plume:** your sun is below −4° (sky dark enough), but the pad's sun is high enough to light exhaust 150 km up (dip ≤ acos(R/(R+h)) ≈ 12.3°, minus a 1° margin). Rated *great* if a point 150 km above the pad is more than 5° above your horizon (allowing for Earth's curve), *good* above 1°.
3. **Night:** rated on how high a point 60 km above the pad sits: above 8° is *good*, above 1.5° is *maybe*.
4. **Day:** *good* within 60 km, *maybe* within 160 km (contrail), otherwise *unlikely*.

Launches with only a month, quarter or year sit in a collapsed "Date not set yet" list.

## Rate limits and offline
Launch Library 2 allows 15 anonymous requests an hour per IP. The page caches the list in `localStorage` for 30 minutes. If the API fails (or is rate limited), it falls back to the last cached copy, then to `snapshot.json` (saved on build day), and says so in red.

## Checks
`test/index.html` runs in the browser from a local server: geometry, sun sanity, a 4-hour LA evening scan that must go day → twilight → night with each verdict matching its sun angles, Phoenix seeing the twilight plume, Lompoc/SLO/SF at noon, TBD handling, `.ics` output and escaping, snapshot shape. It passes: 20 checks. Also checked by hand at desktop and 375 px, light and dark, with no console errors.

## Run it
```bash
cd /Users/august/code/ship100 && python3 -m http.server 8100
```
Then open http://localhost:8100/days/008-rocket-launch-feed/ (tests at `…/test/`).

## Decisions made on the day
- Vandenberg only. It is the only active orbital launch site in California; "launches you can see from California" is in practice Vandenberg.
- Times always show in Pacific time, since the app is about California skies.
- Default town is Los Angeles (most people who see the twilight plume live in Southern California). Geolocation is used only in the tab and never stored.
- Viewing spot coordinates are approximate and the notes tell people to check closures and gate hours; I didn't claim any spot is guaranteed open.
- Icon: an upward arrowhead (SF Symbol `location.north.fill`) on a navy-to-dusk-pink gradient with stars, for a rocket climbing into twilight. There is no rocket SF Symbol available to the icon script.

## What's next
- Fog and cloud forecast at the pad and at your spot (Open-Meteo).
- Per-mission ground track (south vs south-east) to say which way the plume will move.
- A map of the spots with your sight line to the pad.
