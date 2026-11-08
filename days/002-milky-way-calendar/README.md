# Milky Way Calendar

Day 2 of [Ship 100](https://august85.github.io/ship100/). iPhone app (SwiftUI, iOS 17+).

**Live page:** https://august85.github.io/ship100/days/002-milky-way-calendar/

## Plan (as built)
- **Main flow:** open the app → see tonight, the next great night, good nights per month, then a 12-month calendar → tap any night for its window, direction and a chart.
- **Data:** none fetched. Sun, Moon and galactic-centre positions are computed on the phone with the formulas from AstroScout. Place search uses Apple's built-in geocoder (no key).
- **Rule for a night:** longest stretch with sun < −18°, Moon below the horizon (or < 8% lit), and the core ≥ 10° up. Great = 2 h+ with the core near its top for your latitude; Good = 1 h+; Fair = 20 min+.
- **Out of scope:** weather/cloud forecast, light-pollution map (AstroScout has one), notifications, widgets.

## What's in it
- Tonight row and "Next great night" card (falls back to the next good night).
- Good-nights-by-month bar strip; tap a bar to scroll to that month.
- 12 month grids (current month + 11), each night coloured by rating; past days dimmed; a small moon marks bright-moon nights.
- Night detail: window, duration, where to face and how high (degrees and fists), a 6 pm–6 am chart of the core and the Moon with the window shaded, moon phase and rise/set, full darkness, core rise/set, a one-line reason when there's no window, and Share.
- Location: current location, search any place, or 12 preset dark-sky sites (US, India, Canaries, Namibia, Chile, NZ, Australia). The choice is remembered. Times show in the place's own time zone.
- Far north (core never more than ~6° up, roughly north of 55°N) the app says so instead of showing an empty calendar.

## Run it
```bash
cd app
xcodegen
open MilkyWayCalendar.xcodeproj
```
Tests: `xcodebuild test -scheme MilkyWayCalendar -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO` (8 tests: core top altitude, eclipse-date moon phases, a new-moon night rated Great, a full-moon night with no window, no core in December, southern sites beating northern ones).

Screenshot helpers (launch arguments): `-demoNight 2027-07-04` opens that night, `-demoMonth 2027-07` scrolls to that month.

## Files
- `app/App/Astronomy.swift`: copied from AstroScout (`AstroScoutKit/Astronomy`), trimmed to Sun, Moon, galactic centre and the crossing finder.
- `app/App/Planner.swift`: the per-night window, ratings, rise/set times, the 12-month run.
- `app/App/HomeView.swift`, `DayDetail.swift`: screens, chart and place picker. `PlaceStore.swift`: location, search, presets.

## Decisions (made during the unattended run)
- A "night" is labelled by its evening date ("Night of Friday, April 2") because most windows run past midnight.
- Windows come from 10-minute samples, so start and end times are accurate to about 10 minutes. Good enough for planning.
- The minimum core height drops below 10° at high latitudes (it's `max(3, min(10, top − 4))`) so northern users still get their few low nights; the Great/Good height bars also scale to what the latitude allows.
- A thin crescent (< 8% lit) is treated as no Moon.
- Dark UI only, like Day 1: it's a night-sky app.

## Next
- Cloud cover for the next 7 nights from Open-Meteo.
- Bortle class for the chosen place from AstroScout's light-pollution grid.
- A reminder the afternoon before a great night.
