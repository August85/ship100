# Spelling Bee Coach

Day 12 of [Ship 100](https://august85.github.io/ship100/). Web app (plain HTML/CSS/JS, no build step).

**Live:** https://august85.github.io/ship100/days/012-spelling-bee-coach/

## Plan (as built)
- **Main flow:** pick a word list → the app says the word → the child spells it out loud (or taps/types the letters) → Check → stars → 10 words → results with what to practise.
- **Data:** three bundled lists of 30 words each, each with a sentence (`words.js`), or the parent's own list (e.g. this week's school words). Missed words and the custom list live in `localStorage` only.
- **Speech:** the browser's Web Speech API both ways: `speechSynthesis` reads the words, `SpeechRecognition` hears the letters. No keys, no server of our own.
- **Out of scope:** accounts, progress charts over weeks, definitions, a real "bee" with several players, non-English languages.

## What it does
- Three levels: **Little Bee** (3-letter words, ages 5–6), **Busy Bee** (4–5 letters, 6–7), **Queen Bee** (tricky words like *because*, *island*, *knife*, 8–10).
- Like a real bee, the child can ask to hear the word again, hear it in a sentence, or hear it slowly.
- **Spell it out loud:** say letter names ("see, ay, tea"). The app understands the usual ways a recognizer writes letter names (*bee*, *why*, *you*, *are*, *double you*, *aitch*…) and letters run together ("CAT"). Say "oops" to undo a letter, "start over" to clear, "done" to check.
- Letters can always be tapped on a big A–Z keyboard or typed on a real one, so it works in every browser.
- Stars: 3 for right first time, 2 on the second try, −1 for each hint (never below 1), 0 if missed. Two tries per word; after that it shows and spells out the right answer, with the letters the child had right in green and the rest in orange.
- Missed words come first next time on that level, until they're spelled right.
- Own list: paste up to 20 words; the list is remembered.

## Decisions made on the run
- The item had no notes. "Scored" became stars per word, which is easier for a 5-year-old to read than points.
- Letter boxes show how many letters the word has (can be turned off). It makes it much less frustrating for young spellers; older kids can turn it off for a real bee.
- Voice doesn't auto-check: what was heard appears as letter tiles, and the child presses Check (or says "done"). Recognizers mishear single letters (B/D/E/P/T), so the child gets the chance to fix a tile before it counts.
- When the recognizer gives several guesses, the app takes the one that reads most like spelled letters, not the one matching the answer, so it can't mark a wrong spelling right.
- Lowercase letters on tiles and keys, because that's how young kids learn to write.
- Privacy note in the footer: in Chrome the microphone audio goes to Google's speech service, in Safari to Apple's. The app itself stores nothing outside the browser.
- Firefox has no speech recognition; the mic option is switched off there and tapping/typing works.

## Checks
`node test/run.mjs` runs 27 checks on `speller.js` and `words.js`: parsing letter names, run-together capitals, "double you", filler words, oops/start over/done, picking the best recognizer guess, the green/orange letter comparison, stars, round picking (missed words first, no repeats), custom-list cleanup and that every sentence uses its word.

In the browser: played full Little Bee rounds by keyboard (right first time, second try, hint, missed word), checked the missed word came back first, the results screen, a custom list, and the voice flow with a stand-in recognizer (interim letters, a final result with "oops", then "done"; saying the whole word gives the "say each letter" tip). Desktop and 375 px, light and dark, no console errors, no sideways scroll. A real microphone wasn't available in the test browser.

## Run it
From the repo root: `python3 -m http.server 8100`, then open http://localhost:8100/days/012-spelling-bee-coach/. The microphone needs `localhost` or https.

## What's next
- A parent view of the words missed most over several weeks.
- "Beat the clock" bee rounds for older kids.
- Word lists by school year (UK and US spelling).
