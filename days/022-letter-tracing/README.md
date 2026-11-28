# Letter Tracing

Day 22 of [Ship 100](https://august85.github.io/ship100/). iPhone app (SwiftUI, iOS 17+) for kids aged 3–6.

**Live page:** https://august85.github.io/ship100/days/022-letter-tracing/

## Plan (as built)
- **Main flow:** pick a letter or number from the grid → trace it stroke by stroke with a finger → hear it spoken, get 1–3 stars → Next.
- **Data:** none fetched. Stroke shapes are hand-written in `Glyphs.swift` (lines and ellipse arcs in a unit square). Voice is `AVSpeechSynthesizer`.
- **Scoring:** the share of finger samples that stayed near the path: 85%+ = 3 stars, 60%+ = 2, otherwise 1. Best score per glyph is saved in `UserDefaults`.
- **Out of scope:** lowercase letters, recorded human voice, sounds and confetti, parent settings, iPad layout.

## What's in it
- Home grid of A–Z or 0–9 (segmented switch), with best stars on each tile and a total in the corner.
- Trace screen: a wide grey path with a dotted centre line, writing lines (top, dashed middle, baseline), a green numbered start dot, and an arrow pointing the way. Ink fills in only as far as the finger has actually followed.
- "Line 2 of 3" hint, "Show me" demo animation, "Start over", previous/next arrows, and a tap-to-hear header ("B is for ball ⚽️"; numbers show that many dots).
- Done card with stars, the word and emoji, Again / Next. Light haptic per finished stroke, success haptic at the end.
- Light and dark mode. Speech plays even when the phone is on silent (audio session `.playback`).

## Run it
```bash
cd app
xcodegen
open LetterTracing.xcodeproj
```
Tests: `xcodebuild test -scheme LetterTracing -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
- 6 unit tests (`Tests/TracerTests.swift`): all 36 glyphs are in bounds; exact tracing finishes every glyph with 3 stars; a ±0.04 wobble still finishes; scribbling far away does nothing; you can't shortcut across an O; wandering off costs stars.
- 1 UI test (`UITests/TraceUITests.swift`): a real drag down the first stroke of I moves the app on to "Line 2 of 3".

Screenshot helpers (launch arguments): `-demo B:0.55` opens B 55% traced (`:1` shows the done card), `-demoStars` fills in sample stars, `-resetStars` clears them.

## Files
- `app/App/Glyphs.swift`: stroke data for A–Z and 0–9, plus arc/line building and resampling.
- `app/App/TraceView.swift`: `Tracer` (the tracing logic, no UI) and the trace screen.
- `app/App/App.swift`: app entry, home grid, star store, voice, colours.

## Decisions (made during the unattended run)
- Capitals only. They're what most 3–4 year olds learn first and they're all straight lines and simple curves. Lowercase is the obvious next step.
- Lifting the finger mid-stroke keeps your progress. Small kids lift a lot; restarting the stroke each time would be frustrating.
- Look-ahead is 12 points (about 18% of the box), so the finger can't jump across a letter but quick strokes still keep up.
- Lingering at the end of a finished stroke isn't counted as "off the path" (found by the tests: E only scored 2 stars when traced perfectly).
- Every child who finishes gets at least one star.
- The letter is spoken as the bare capital ("B"). iOS speech reads these as letter names; it can't be checked by ear in an unattended run, so it's worth a listen.
- X uses "xylophone 🎶" (there's no xylophone emoji). Numbers use 🍎 with dots for counting.
- I couldn't drive the simulator by touch in a scheduled run, so the real drag gesture is checked with the XCUITest instead.

## Next
- Lowercase a–z.
- A sticker or sound reward after every five letters.
- Bigger canvas and two-column layout on iPad.
- Trace-your-name mode.
