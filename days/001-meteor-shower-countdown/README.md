# Meteor Shower Countdown

Day 1 of [Ship 100](https://august85.github.io/ship100/). iPhone app (SwiftUI, iOS 17+).

**Live page:** https://august85.github.io/ship100/days/001-meteor-shower-countdown/

## Plan (as built)
- **Main flow:** open the app → see the countdown to the next shower peak, how many meteors you'll realistically see, and where to look from where you are.
- **Data:** the 12 major showers from the IMO calendar, bundled in the app. All sky positions computed on the phone, so it needs no network and no API keys.
- **Out of scope:** minor showers, live meteor counts, a light-pollution map (that's AstroScout's job), widgets.

## What's in it
- Live countdown to the next peak, plus a list of all 12 showers in date order with a Great/Good/Fair/Poor rating for your location.
- "Where to look": best time on the peak night, compass direction, radiant height in degrees and fists.
- Peak-night chart of radiant altitude with the dark hours (sun below −12°) shaded.
- Expected meteors per hour = ZHR × sin(radiant altitude) × a sky factor that drops with moonlight. Rough on purpose; it's for "is it worth going out", not science.
- An 8 pm local notification on the evening of the peak.
- Share: one message with the peak, best time, direction, expected rate and moon. Calendar: Apple's own new-event screen, prefilled with a 2-hour window around the best time and a 1-hour alert (no calendar permission needed).
- Uses your location when allowed; otherwise shows San Francisco.

## Run it
```bash
cd app
xcodegen
open MeteorShowerCountdown.xcodeproj
```
Run on any iPhone simulator or device. Tests: `xcodebuild test -scheme MeteorShowerCountdown -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` (10 tests on the astronomy math).

## Files
- `app/App/Sky.swift`: sidereal time, alt/az, sun position, moon phase, night planner and rate estimate.
- `app/App/Showers.swift`: shower data and peak/active-window logic.
- `app/App/Views.swift`, `Stores.swift`: SwiftUI screens, location and reminders.
- `app/App/Sharing.swift`: share text and the Add to Calendar sheet.
- `app/Tests/SkyTests.swift`: checks against known values.

## Decisions
- Peak times are typical IMO times; real peaks drift up to a day year to year. The app says so.
- The "peak night" is the 6 pm to 7 am night that contains the peak, or the night before it when the peak falls in the morning. For daytime peaks (e.g. Quadrantids 2027 at 1 pm Pacific) it shows the following night.

## Next
- Year-specific peak times from the IMO calendar instead of typical dates.
- Home-screen widget with the countdown.
- An app icon (it uses the blank placeholder for now).
- Pull in AstroScout's light-pollution grid to adjust the rate for your actual sky.
