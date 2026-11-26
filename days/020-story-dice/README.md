# Story Dice

Day 20 of [Ship 100](https://august85.github.io/ship100/). Web app.
Live: https://august85.github.io/ship100/days/020-story-dice/

Roll three picture dice (a hero, a place, a problem) and get a story starter to tell together, read aloud by the phone.

**Plan**
1. Main flow: tap Roll → three big emoji dice tumble and land (hero, place, problem) → a story starter appears and the phone reads it aloud → three "what happens next?" questions to take turns on.
2. Data: three hand-written 12-face dice in `engine.js` (12 × 12 × 12 = 1,728 starters). No network calls.
3. Tap a die to keep it, so you can keep the same hero and roll a new problem.
4. Read-aloud uses the browser's built-in Web Speech API. Settings (auto-read, speed) are kept in `localStorage`.
5. Out of scope: recording the story you tell, AI-written stories, picture art beyond emoji, other languages.

## Run it

Open `index.html` through any static server, e.g. from the repo root:

```bash
python3 -m http.server 8100
```

then go to `http://localhost:8100/days/020-story-dice/`. Tests for the story engine:

```bash
node days/020-story-dice/engine.test.mjs
```

## How it works

- `engine.js` holds the dice and builds the starter: an opening line ("Once upon a time, there was a little dragon called Ember, who lived on the Moon."), a twist from the problem die, two questions written for that problem and one general question ("Who could help Ember?"), then "How does the story end?".
- Every hero has a name, so stories never need a he or she.
- The three rolled words are underlined in their die's colour, so a pre-reader can match picture to word.
- Keyboard: Tab to a die and press Space to keep it; press R anywhere to roll. Motion is turned off with `prefers-reduced-motion`.

## Decisions made on the day

- Emoji instead of drawn art: it ships today, looks the same on every phone, and kids recognise them.
- No AI: a fixed, reviewed set of sentences keeps everything age-appropriate and works offline.
- The local preview server was declined in the automated run, so the page was checked on the live site after shipping.

## What's next

- A "story so far" mode where each roll adds a new chapter.
- More dice faces, and a Hindi voice option.
