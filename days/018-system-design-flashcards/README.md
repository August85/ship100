# System Design Flashcards

Day 18 of [Ship 100](https://august85.github.io/ship100/). Web app.
Live: https://august85.github.io/ship100/days/018-system-design-flashcards/

Spaced repetition for system design: 293 cards from the Distinguished Engineer library in [LevelUP](https://github.com/August85/levelup). A few minutes a day; cards you miss come back sooner, cards you know drift out to weeks and months.

**Plan**
1. Main flow: open the page → "Study N" (due reviews first, then up to 20 new cards) → read the question → Show answer → grade Again / Hard / Good / Easy → next card → "Done for now" with tomorrow's forecast.
2. Data: `cards.json`, built once from LevelUP's `app/data/library.json` by `scripts/build-cards.mjs` (LevelUP is read, never edited). No network calls after the page loads.
3. Scheduler: `engine.js`, a small SM-2-style scheduler (ease factor per card, intervals in whole local days). Progress is stored in `localStorage` only.
4. Extras that stay small: deck picker by group, new-cards-per-day setting, 7-day review forecast, day streak, export/import progress as JSON, keyboard shortcuts.
5. Out of scope: accounts or sync, editing cards in the page, cloze cards, images, the full volume text.

## The cards

| Group | Decks | Cards | From LevelUP |
|---|---|---|---|
| Interview practice | 11 | 135 | `content/practice.md` (short-answer Q&A) |
| Design principles | 7 | 50 | `content/principles.md` catalog (name → what it claims) |
| Volume principles | 4 | 54 | "Design Principles" sections of Volumes 1–4 |
| Algorithms | 11 | 54 | `content/algorithms-*.md` (name → problem it solves) |

## Decisions made on the day

- **Honest about "22 volumes".** The idea said "built from your 22 DE volumes". LevelUP's catalog lists 22 volumes, but only Volumes 1–4 have full text today. So the page says "293 cards from the Distinguished Engineer library" rather than claiming all 22. When more volumes are written, re-run the build script and their principles appear as new decks automatically.
- **Practice, principles and algorithms, not raw prose.** Volume text is long-form and doesn't split into fair question/answer pairs without hand editing or an LLM. The library already has question-shaped material (practice Q&A, named principles, named algorithms), so the cards use that. No LLM, no key.
- **SM-2, slightly simplified.** New card: Good → 1 day, Easy → 4 days. After that Good multiplies the interval by the card's ease (starts at 2.5), Hard ×1.2 and lowers ease, Easy ×ease×1.3. Again puts the card back three cards later in the same session and resets its interval. Ease never drops below 1.3.
- **New-card limit counts once.** A new card counts against the daily limit the first time it's answered, even if you press Again. "Learn 10 more" raises today's limit only.
- **Answers are bundled HTML.** The build script keeps only a few tags (`p`, `strong`, `em`, `code`, lists) and drops all attributes, so the page can render bold and code safely.
- **Keyboard:** Space or Enter shows the answer; 1–4 grade; Space on a shown answer means Good; Esc goes back to the decks.

## Run it

Serve the repo root and open `days/018-system-design-flashcards/`:

```bash
python3 -m http.server 8100
```

Tests for the scheduler (intervals, ease floor, lapses, queue order, streak, forecast, dates):

```bash
node days/018-system-design-flashcards/engine.test.mjs
```

Rebuild the cards after LevelUP changes:

```bash
node days/018-system-design-flashcards/scripts/build-cards.mjs /path/to/levelup/app/data/library.json
```

## Checked

Driven in headless Chrome: home → study 20 new cards with every grade → done screen → home shows 20 learned, 1-day streak, 19 due tomorrow and 1 in four days → "Learn 10 more" → study at 375px in light and dark. No console errors, no horizontal scroll at 375px.

## What's next

- Cards from the "What a DE Probes" sections once the remaining volumes are written.
- A "cram" mode for one deck before an interview, without touching the schedule.
- Add it to LevelUP's Practice tab so progress lives next to the reader.
