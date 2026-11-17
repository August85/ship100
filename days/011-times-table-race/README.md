# Times Table Race

Day 11 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/011-times-table-race/

## Plan (as built)
- **Main flow:** pick which times tables → 60-second race → answer as many as you can → results with what to practise.
- **Data:** none. Questions are generated in the browser (`game.js`); best scores live in `localStorage` only.
- **The "race":** your car moves one step per right answer. From the second race on, a grey ghost car drives your best run for those tables at an even pace, so you're racing yourself.
- **Out of scope:** division, accounts or leaderboards, multiple players, levels or unlockables.

## What it does
- Pick any of the 1–12 tables, or a preset (Starter 2/5/10, Easy, Tricky, All). Each question is the table × 2–12, shown either way round (7 × 8 or 8 × 7).
- Type on a keyboard or tap the big keypad. The answer goes in by itself once enough digits are typed (Enter / Go for early submits).
- 10 points per right answer; a streak of 4 makes it ×2, a streak of 8 makes it ×3. A wrong answer shows the right one for a second and resets the streak.
- A missed fact comes back three questions later, while it's fresh.
- Results: points, right answers, accuracy, best streak, seconds per answer, and a "Practise these" list of the missed facts. Best score is kept per set of tables.
- Pauses if you switch tabs. Sound beeps can be turned off. Escape ends a race early.

## Decisions made on the run
- The item had no notes. Times tables suit about 7–10 year olds, so the look is bright and simple but not baby-ish.
- ×1 and ×0 are left out; they're too easy to make a race fun.
- Auto-submit when the right number of digits is typed: it makes it feel like an arcade game rather than a form. A wrong answer with fewer digits still needs Enter/Go.
- Default tables are 2, 3, 4, 5 and 10 (the usual first ones at school). The last choice is remembered.
- Car emoji for the cars rather than drawn art, so it stays small and works everywhere.

## Checks
`node test/run.mjs` runs 1,000+ checks on `game.js`: every question comes from the chosen tables and has the right answer, no fact twice in a row, combo scoring, missed facts coming back within three questions, the summary counts, and track positions. Played full races by hand at desktop and 375 px in light and dark: keyboard and tap input, timer running out, a new record, the ghost car on the second race, no console errors and no sideways scroll.

## Run it
From the repo root: `python3 -m http.server 8100`, then open http://localhost:8100/days/011-times-table-race/

## What's next
- A "facts I miss most" view across many races.
- Division mode (same facts, reversed).
- A two-player split-screen race on one tablet.
