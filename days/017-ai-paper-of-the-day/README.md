# AI Paper of the Day

Day 17 of [Ship 100](https://august85.github.io/ship100/). Web app.
Live: https://august85.github.io/ship100/days/017-ai-paper-of-the-day/

The most upvoted AI paper on arXiv each day, in five short bullets.

**Plan**
1. Main flow: open the page → yesterday's top paper loads → five labelled bullets (problem, gap, what they did, key result, why it matters) → links to arXiv, the PDF, discussion and code. Step back or forward a day, or open any of the next four papers that day.
2. Data: [Hugging Face Daily Papers](https://huggingface.co/papers) (`/api/daily_papers?date=YYYY-MM-DD`): public, no key, and it allows browser requests. "Paper of the day" = most upvotes, then most comments.
3. Bullets with no AI: `engine.js` splits the abstract into sentences and gives each of the five roles its best-fitting sentence, scored by cue words and position. Optional: paste your own Anthropic key and Claude rewrites them in plain words.
4. Offline: if Hugging Face can't be reached, it shows a saved sample day (`sample.json`, 2026-11-20).
5. Out of scope: accounts, email digests, choosing categories, a server-side daily cron, full-text (PDF) summaries.

## Decisions made on the day

- **Hugging Face, not the arXiv API.** arXiv's API doesn't allow browser requests (no CORS), and this has to stay a static page. Hugging Face's daily list is arXiv papers that people picked and voted on, which gives a fair "one paper a day" pick without me choosing.
- **Yesterday by default.** Today's list starts empty and votes come in all day, so the page opens on yesterday (UTC). Weekends and holidays have no list; it steps back to the last day that has one.
- **Honest labels.** The default bullets are sentences picked from the abstract, and the page says so. The Hugging Face one-line TL;DR is shown separately and credited.
- **Bring your own key.** The Claude option uses the official `@anthropic-ai/sdk` (pinned 1.7.0 from jsdelivr, loaded only when you click), model `claude-opus-5-5` at low effort, with the server-side refusal fallback turned on. The key stays in your browser (saved only if you tick "Remember"); results are cached per paper in `localStorage`.

## Run it

Serve the repo root and open `days/017-ai-paper-of-the-day/`:

```bash
python3 -m http.server 8100
```

Tests for the pure logic (sentence splitting, role picking, ranking, dates, parsing Claude's reply):

```bash
node days/017-ai-paper-of-the-day/engine.test.mjs
```

A shareable link for a given day: `…/017-ai-paper-of-the-day/#2026-11-20`.

## What's next

- A daily email or RSS feed (would need a small scheduled job).
- Filter by topic (vision, agents, RL) using Hugging Face's keywords.
- "Explain it like I'm new to the field" mode for the Claude option.
