# Subscription Killer

Day 16 of [Ship 100](https://august85.github.io/ship100/). Web app.
Live: https://august85.github.io/ship100/days/016-subscription-killer/

Upload a card statement CSV and see every recurring charge.

**Plan**
1. Main flow: drop a bank or card CSV → it finds every charge that repeats on a schedule → shows what you pay per month and per year → tick the ones to cancel and see the yearly saving, with a how-to-cancel hint for each.
2. Data: only the file you drop in, read with `FileReader`. A made-up 13-month demo statement (`sample.js`) for trying it out. No network calls.
3. Logic in `engine.js` (pure, tested): CSV parsing, column detection, date and sign guessing, merchant cleanup, cadence detection.
4. Privacy: nothing is uploaded or stored. Only the chosen currency is kept in `localStorage`.
5. Out of scope: PDF statements, bank logins (Plaid etc.), actually cancelling anything, multi-file merging.

## How detection works

- **Columns.** Finds the header row (it may be a few rows down, as in HDFC exports), then the date, description and amount columns. Handles a single signed amount column (Chase, Amex, Discover, BofA) or separate Debit/Credit or Withdrawal/Deposit columns (Capital One, Citi, HDFC, ICICI). If it can't tell, it asks you to pick the columns.
- **Dates.** ISO, `MM/DD/YYYY`, `DD/MM/YY`, `05-Mar-26`, `Mar 5, 2026`. Day-first is picked when any date has a first part over 12.
- **Which sign is a charge.** With one amount column, whichever sign most rows have is treated as a charge (statements are mostly purchases). Card payments, transfers, refunds, NEFT/IMPS and cashback lines are dropped.
- **Merchants.** About 35 known subscription brands are matched by name (Netflix, Spotify, Apple, Google, Prime, ChatGPT, Claude, Adobe, NYT, Hotstar, gyms, phone bills…). Everything else is cleaned up (`SQ *`, `TST*`, store numbers, phone numbers, `.COM`, state codes) and grouped by its first two words.
- **Plans.** Charges from one merchant are split into amount bands, so iCloud $2.99 and Apple TV $9.99 show as two lines, while a promo price going from $4 to $6.25 stays one.
- **Cadence.** Weekly, monthly, quarterly or yearly, from the median gap between charges. At least 60% of gaps must fit and amounts must be steady. Monthly needs 3 charges (2 for a known brand); weekly needs 4 charges with near-identical amounts, so a weekly coffee habit doesn't count.
- **Extras.** Price increases are flagged. A charge whose next payment never arrived before the statement ended goes under "Looks stopped". The yearly cost uses the latest price.

## Decisions made today (nobody to ask)

- Phone and internet bills count as recurring (they are), with a hint to check the plan rather than cancel.
- Totals only include active charges, not the "Looks stopped" ones.
- Currency is a dropdown, auto-switched to ₹ for Indian-bank style headers (Narration / Withdrawal). No conversion between currencies.
- Ticked items aren't saved: merchant names from a real statement felt too personal to leave in browser storage.
- Cancel hints are text, not links, so they don't rot when a company moves its settings page.

## Run it

No build step. From the repo root: `python3 -m http.server 8100` and open `/days/016-subscription-killer/`.
Tests: `node engine.test.mjs` (CSV quirks, five date formats, Chase/Amex/Capital One/HDFC shapes, and the demo statement).

## What's next

- Merge several CSVs (two cards, a bank account) into one view.
- PDF statement import.
- Calendar export (.ics) of upcoming renewal dates, especially yearly ones.
