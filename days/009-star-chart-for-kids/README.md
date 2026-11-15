# Star Chart for Kids

Day 9 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/009-star-chart-for-kids/

## Plan (as built)
- **Main flow:** type the child's name → pick 3–5 picture chores and a reward → tap a star each time a chore is done (the reward bar fills up and celebrates at the goal) → or print it on one landscape page for the fridge.
- **Data:** none from the network. Chore and reward presets are bundled in `chart.js`; the chart is saved in `localStorage` on this device only.
- **Reuse:** the look comes from TinyStarClub.com (Abhimanyu's kids' astronomy club site): the warm amber-to-sky gradient of its hero and the navy-and-gold star of its favicon, which became the "Night sky" theme. No code was copied; that site is React + Tailwind and this day has no build step.
- **Out of scope:** more than one child per device, syncing between phones, sticker-sheet printing, streaks across weeks.

## What it does
- Up to 8 chores, each a big emoji plus a short label, since 3–6 year olds read pictures, not words. Fourteen presets (brush teeth, make bed, tidy toys…) or any emoji you type.
- A 7-day grid starting on any date (defaults to this week's Monday). Today's column is outlined.
- A reward with its own emoji and a star goal (clamped to what the chart can actually reach). Hitting the goal shows a "Maya did it!" card and a star burst (skipped with reduced motion).
- **Print chart** prints the sheet with the stars so far. **Print blank** prints empty outlines for stickers or crayons. Both fit one landscape page and keep the theme colours.
- **Next week** keeps the chores and reward, clears the stars and moves the dates on 7 days.
- Four themes: Sunshine, Night sky, Ocean, Garden.
- Keyboard: the grid is one tab stop; arrow keys, Home and End move around; Space/Enter toggles a star. Each cell is a toggle button labelled like "Brush teeth, Monday".

## Decisions made on the run
- The item had no notes, so I picked the 3–6 age range from the project's "kids 3–6" theme and leaned on emoji over text.
- One chart per device rather than multiple kids, to keep the day to one polished flow.
- Saved data is run through `sanitize()` on load, so old or hand-edited storage can't break the page.

## Checks
`test/index.html` (open from a local server) checks week maths (including a month boundary and a daylight-saving week), star toggling and counting, goal clamping, next week, and loading bad saved data: 23 checks pass. Checked by hand at desktop and 375 px, light and dark, Night sky theme, with no console errors and no sideways scroll. Print checked with headless Chrome: one landscape page.

## Run it
```bash
cd /Users/august/code/ship100 && python3 -m http.server 8100
```
Then open http://localhost:8100/days/009-star-chart-for-kids/ (and `/test/` for the checks).

## What's next
- Several kids on one device, each with their own chart.
- A share link that carries the chart's set-up (not the stars) to the other parent's phone.
- Printable sticker sheets in the same style.
