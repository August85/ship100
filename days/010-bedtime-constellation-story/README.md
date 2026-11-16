# Bedtime Constellation Story

Day 10 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/010-bedtime-constellation-story/

## Plan (as built)
- **Main flow:** open the page → it works out which constellation is well placed at your child's bedtime tonight → shows it drawn the way it's turned in the sky, where to look ("north-east, high up"), and a five-paragraph story to read aloud (or have the browser read it).
- **Data:** none from the network. 16 constellations (star positions, stick-figure lines, story, how to find it, a fact, where the story comes from) bundled in `stories.js`. Positions are computed in the browser (`sky.js`).
- **Location:** a list of 23 cities (default picked from the device's time zone) or "Use my location", rounded to 0.1° and kept in `localStorage` only.
- **Out of scope:** planets and the Moon, a full sky map, more than 16 constellations, recorded audio, other languages.

## What it does
- Bedtime picker (6:30 to 9:30 pm, local to the chosen city). Among constellations sitting 28°+ up with their stars clear of the horizon, it rotates by date, so each night tells a different story (a week of New York bedtimes in November gives 7 different ones).
- The drawing is a projection of the real stars as seen facing that way, with "up" towards the zenith, so the Big Dipper or Cassiopeia's W appears tilted the way it actually is tonight.
- If the Sun is still up or it's twilight at that time (summer evenings, high latitudes), a note says so.
- **▶ Read it to me** uses the browser's built-in speech (slowed down a little). **Aa Bigger words** makes the story large for reading in a dim room. **Another star story** and the "Also up tonight" chips switch to other constellations that are up.
- Southern sky included: Crux, Scorpius (as Maui's fishhook), Sagittarius (the Teapot), Canis Major.

## Decisions made on the run
- The item had no notes. I followed the project's "kids 3–6" theme: each story is five short paragraphs ending in a goodnight, and the myths are softened (no monsters, no punishment worse than being put in the sky to think about being kind). The grown-up origin of each story is listed under it so parents can look up the full version.
- Where a non-Greek story suits small children better, I used it: the Cowherd and the Weaver Girl for Aquila/Vega, Maui's fishhook for Scorpius, the Teapot for Sagittarius, the Seven Sisters for Taurus.
- Stories were written fresh for this app; none is copied from a book.
- Star positions are J2000, rounded; the maths is good to about a degree, which is far finer than "look north-east, halfway up" needs.
- Default bedtime 7:30 pm.

## Checks
`test/` has 79 checks (run `node test/run.mjs`, or open `test/` from a local server): sidereal time at J2000, Polaris altitude equals latitude, Sirius crossing due south at the right height, Sun altitude at an equinox noon, time-zone conversions including daylight time, every constellation's lines and story, that tonight's pick is really above the horizon for New York, London, Sydney and Bengaluru across four seasons, that Crux never appears from London, and that a week of bedtimes gives different stories. Checked by hand at desktop and 375 px, light and dark, with no console errors and no sideways scroll.

## Run it
```bash
cd /Users/august/code/ship100 && python3 -m http.server 8100
```
Then open http://localhost:8100/days/010-bedtime-constellation-story/

## What's next
- Show the Moon and bright planets when they're near tonight's constellation.
- A "story calendar" that prints a month of bedtime constellations.
- Recorded narration in a warm human voice, and a Hindi version.
