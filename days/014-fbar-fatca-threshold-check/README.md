# FBAR / FATCA Threshold Check

Day 14 of [Ship 100](https://august85.github.io/ship100/). Web app.
Live: https://august85.github.io/ship100/days/014-fbar-fatca-threshold-check/

**Plan**
1. Main flow: pick tax year and filing status → list Indian accounts (highest balance, 31 Dec balance, in ₹) → two verdict cards: FBAR yes/no and Form 8938 yes/no, with how close you are.
2. Data: Treasury Reporting Rates of Exchange (India-Rupee), loaded live from fiscaldata.treasury.gov (keyless, CORS-open); year-end rates 2019–2025 bundled as a fallback.
3. Logic in `engine.js` (pure, tested): FBAR = sum of each account's max > $10,000; Form 8938 = year-end and any-time tests against the status/residence thresholds.
4. Privacy: balances live only in `localStorage`; nothing is sent anywhere. Labeled "Not financial or tax advice."
5. Out of scope: non-Indian accounts / other currencies, filing the forms, exact joint-ownership splits, non-account assets (direct foreign stock, entity interests), state rules.

## What it does

- **Tax year** 2019 to this year. Past years use the official 31 Dec Treasury rate; the year in progress uses the latest quarterly rate and says it's provisional. You can type your own rate.
- **Filing status** (single / MFJ / MFS) and **living abroad** switch the Form 8938 thresholds ($50k/$75k, $100k/$150k, $200k/$300k, $400k/$600k).
- **Accounts**: name, type (savings/NRO/NRE, FD, demat, mutual fund folio, PPF, EPF, NPS, insurance with cash value, other), highest balance, 31 Dec balance. Flags: *Count* (to see a grey-area account in or out), *Signing authority only* (FBAR yes, 8938 no), *Closed during year* (year-end = 0). Rupee inputs accept `12,34,567` and are tidied to Indian grouping.
- **Verdicts**: a meter for each test, how much room is left (in $ and ₹) or how far over, and when/where to file.
- **Load demo** fills five made-up accounts (demo data, not anyone's real balances).

## Decisions made today (nobody to ask)

- "At any time" for Form 8938 is the sum of each account's own maximum. That's the cautious reading; the true peak on one day could be lower.
- PPF, EPF, NPS and cash-value insurance count by default, with a note that they're grey areas. A *Count* checkbox lets you take one out.
- A "highest" balance lower than the 31 Dec balance is treated as the 31 Dec balance.
- Rupee only: the tool is for Indian accounts, per the idea. Other currencies would need a currency picker per row.

## Run it

No build step. From the repo root: `python3 -m http.server 8100` and open `/days/014-fbar-fatca-threshold-check/`.
Tests: `node engine.test.mjs`.

## Data sources

- [Treasury Reporting Rates of Exchange](https://fiscaldata.treasury.gov/datasets/treasury-reporting-rates-exchange/treasury-reporting-rates-of-exchange), Fiscal Data API, `country_currency_desc = India-Rupee`.
- Thresholds from the FinCEN FBAR rules and the [IRS Form 8938 instructions](https://www.irs.gov/instructions/i8938).

## What's next

- Other currencies (AED, GBP, SGD) per account.
- "FBAR worksheet" export: a CSV of each account's max in USD, ready to copy into BSA E-Filing.
- Joint ownership splits for Form 8938 (MFS, non-spouse co-owners).

Not financial or tax advice.
