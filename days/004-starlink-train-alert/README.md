# Starlink Train Alert

Day 4 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/004-starlink-train-alert/

## Plan (as built)
- **Main flow:** enter a US ZIP code (or a city, or use your location) → see whether any recent Starlink launch is still flying as a "train" → if it is, see the next time it crosses your dark sky, which way to look, and add it to your calendar.
- **Data:** CelesTrak's `last-30-days` group as JSON (OMM), filtered to Starlink. ZIP codes from Zippopotam.us, city search and cloud cover from Open-Meteo. All free and keyless.
- **Math:** the SGP4 port from Day 3 (originally from SatellitePaglu), plus `train.js`, which decides how bunched up each launch still is and merges the passes of its front, middle and back satellites.
- **Out of scope:** email alerts (see below), launch schedules, single non-train satellites, a live sky view.

## What's in it
- A status card for every Starlink launch in the last 30 days: when it went up, how high it is, and a small ring showing where its satellites sit around the orbit. A tight gold clump means a train.
- If a train (or a loose string) is up: the next visible pass with times, directions, height in fists, an estimated brightness, cloud cover from the forecast, and a sky map. A list of every visible pass in the next 5 days follows.
- "Remind me" downloads an .ics with a 15-minute alarm. "Email this to myself" opens your own mail app with the details filled in.
- When there's no train (as on launch day: the newest batch had been up 14 days and spread out), a **demo train** shows what the page looks like a day or two after a launch. It's labeled as made up everywhere, including in the calendar event. Add `?demo` to the URL to open it directly.

## How a train is detected
For each launch, every satellite's position along its orbit (argument of latitude) is worked out for right now. The 45° stretch of orbit holding the most satellites is the train candidate (45° is about 11 minutes of flight):
- 60% or more of the launch inside it: **train**
- 40–60%: **loose string**, still shown
- less: **spread out**, no passes shown

Launch time is estimated from each element set's epoch minus `REV_AT_EPOCH / MEAN_MOTION`. Passes use the same visibility test as Day 3 (satellite sunlit, observer's sun more than 6° below the horizon). Brightness uses a standard magnitude of 3.0 at 1,000 km, a rough figure for satellites still raising their orbits. It's an estimate.

## Run it
Serve the repo root and open the folder:
```bash
python3 -m http.server 8100
# http://localhost:8100/days/004-starlink-train-alert/
```
Tests (Node 18+): `node days/004-starlink-train-alert/test/train.test.mjs`. They check the OMM parser against the TLE parser, the arc search, train detection on the bundled snapshot, and pass merging on the demo train.

## Decisions made during the unattended build
- **No email.** The idea said "get an email", but sending mail needs a server and a mail provider account, and Ship 100 pages have no backend or sign-up. A calendar event with an alarm does the same job without either. A real email version would need a small scheduled job (e.g. a GitHub Action) plus a mail service. That's a choice for Abhimanyu, so it's listed under "What's next".
- **JSON instead of TLE text.** CelesTrak's TLE output stops at catalog number 69,999, and every new Starlink has a six-digit number, so they're simply missing from the TLE files. `orbit.js` gained `parseOMM()` to read the JSON format instead.
- **CelesTrak's `last-30-days` group** (about 100 KB) instead of the full Starlink group (1.8 MB). Trains only exist in the first weeks after launch anyway. The data is cached in the browser for 2 hours, because CelesTrak refuses repeat downloads inside that window. If the download fails, the page falls back to a saved copy, then to the bundled `starlink-recent.json` snapshot.
- **Demo train:** 24 clones of a real satellite, 0.4° apart. It uses whichever recent launch's orbit gives your location the most visible passes, so the demo isn't empty.
- Launch Library 2 (for upcoming launch dates) timed out during the build, so there's no "next launch" countdown.
- Pass search is 5 days, not 10: orbits of satellites that are still raising change too quickly for longer predictions to hold.

## What's next
- Email or push alerts through a small scheduled job, if worth running a backend.
- "Next Starlink launch" from a launch schedule, with a "train likely visible" estimate.
- Amazon Kuiper and Qianfan trains, which this same logic would handle.
