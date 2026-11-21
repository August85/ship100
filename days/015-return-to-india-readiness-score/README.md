# Return-to-India Readiness Score

Day 15 of [Ship 100](https://august85.github.io/ship100/). Web app.
Live: https://august85.github.io/ship100/days/015-return-to-india-readiness-score/

**Plan**
1. Main flow: answer 20 questions (Done / In progress / Not yet / Doesn't apply) in five groups → live score out of 100 in a sticky bar → result card with a meter per group and the top 6 gaps, each with a one-line tip.
2. Data: a bundled question list in `engine.js`. No network calls at all.
3. Logic in `engine.js` (pure, tested): weighted score (critical ×3, important ×2, nice-to-have ×1); "Doesn't apply" drops a question from the maximum; gaps ranked by points missing.
4. Privacy: answers live only in `localStorage`. Labeled "Not financial or tax advice."
5. Out of scope: personalised tax maths (RNOR day counts, DTAA), country choices other than US → India, accounts or sharing links.

## What it does

- **20 questions** across Money & tax, Work & health, Home & move, Family, and Papers & IDs. Six are marked *Critical* (emergency fund, RNOR timing, income, health cover, partner on board, OCI for US-citizen family).
- **Score** updates as you tap. Bands: Early days (0–39), Getting there (40–69), Nearly ready (70–89), Ready to book (90+).
- **Next up**: the biggest gaps first, with a short tip and a link back to the question.
- **Copy summary** puts a plain-text result on the clipboard. **Load example** fills made-up answers for a family about a year out.

## Decisions made today (nobody to ask)

- Unanswered questions count as "Not yet" in the score, so the number only climbs as you work through it.
- "Doesn't apply" is only offered where it can genuinely not apply (no kids, no US home, already resident in India for work, etc.). Core items like the emergency fund and health cover always count.
- Tips stay general and point to a cross-border CA for anything tax-specific. No numbers for thresholds that change yearly.
- No shareable result URL: answers about family and money felt too personal to put in a link.

## Run it

No build step. From the repo root: `python3 -m http.server 8100` and open `/days/015-return-to-india-readiness-score/`.
Tests: `node engine.test.mjs`.

## What's next

- A printable checklist view with dates ("6 months out", "1 month out", "first week in India").
- Per-question "learn more" links to official pages (RBI/FEMA on NRE/NRO, Indian customs on Transfer of Residence, OCI portal).
- Other routes (UK, Canada, Gulf → India).

Not financial or tax advice.
