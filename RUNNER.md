# Daily run: how one product gets built and shipped

The scheduled task "Ship 100 daily build" runs this every morning at 6:00 AM (Pacific) on Abhimanyu's Mac.
Follow it top to bottom. Work in `/Users/august/code/ship100`. Nobody is watching live, so make sensible
calls yourself and write down what you decided. Never stop to ask a question.

## 0. Sync and check
```bash
cd /Users/august/code/ship100
git checkout main && git pull --rebase --autostash
node scripts/day.mjs status
```
If `action` is `"stop"`, end the run. Report the `reason` in one line and do nothing else.

## 1. Claim today's item
```bash
node scripts/day.mjs start
git add -A && git commit -m "day N: start <title>" && git push
```
This marks the item `building`, gives it its day number, and scaffolds `days/NNN-slug/` from `templates/`.
The tracker page shows it as Building once the push lands. If `resumed` is true, a previous run died
part-way: continue from what is already in the folder instead of starting over.

## 2. Understand it
- Read the item's `title`, `summary` and `notes` (notes are Abhimanyu's instructions and override anything here).
- If `reuses` lists projects, read them at `/Users/august/code/<name>` **read-only**. Copy what you need
  into today's folder. Never edit, commit to or push those repos.
- Write a 5-line plan at the top of `days/NNN-slug/README.md`: the one main flow, the data source, what's out of scope.

## 3. Build it (a single day, kept small)
Aim for one polished main flow, not many half-done features. Target: done within about 3 hours of work.

| Platform | Where the code goes | What Pages serves at `days/NNN-slug/` |
|---|---|---|
| `web` | `days/NNN-slug/` (index.html, style.css, app.js) | the app itself |
| `ios` | `days/NNN-slug/app/` (XcodeGen `project.yml` + `App/`) | landing page with simulator screenshots |
| `garmin` | `days/NNN-slug/app/` (Connect IQ project) | landing page with simulator screenshots + .prg download |
| `pi` | `days/NNN-slug/app/` (`main.py` with `--mock`) | landing page with a sample output / demo |

Rules for every product:
- **No build step for web.** Plain HTML/CSS/ES modules. CDN imports only from cdnjs, jsdelivr or unpkg, pinned to an exact version.
- **Free, keyless data first** (Open-Meteo, CelesTrak, NASA, Wikipedia, public JSON, bundled data files).
  If a feature needs a paid key or an LLM, add a "bring your own key" field stored in `localStorage` (wrapped in try/catch). Never commit a key.
- **No personal data in the repo, ever:** no glucose readings, account details, home address, photos of family.
  Health or finance items ship with clearly labeled demo data. Finance tools say "Not financial or tax advice."
- **No trackers, no analytics, no ads, no sign-up.**
- Mobile-first, works at 375px wide, light and dark mode, keyboard accessible, no console errors.
- Keep the template's header (back link to Ship 100 + "Day N / 100") and footer.
- iOS: bundle id `com.ak.ship100.<id>` (already in the template). Build for the simulator with `CODE_SIGNING_ALLOWED=NO`.
- Garmin: build with the SDK in `~/Library/Application Support/Garmin/ConnectIQ/Sdks/` and the key at
  `/Users/august/code/StarterFace/developer_key` (pass it with `-y`; **never copy the key into this repo**).
  Put the built `.prg` in `days/NNN-slug/download/` so the landing page can link to it.

## 4. Check it works
- **Web / landing page:** serve the repo root (`python3 -m http.server 8100`), open
  `http://localhost:8100/days/NNN-slug/` in the browser tool, use the main flow, check the console, and
  take a desktop and a 375px screenshot. Fix anything broken.
- **iOS:** `xcodegen` then `xcodebuild … -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build`,
  install and launch in the simulator, take 2–3 screenshots into `shots/`.
- **Garmin:** `monkeyc` build for `fenix847mm` with no errors; screenshot from the Connect IQ simulator if it can be driven, otherwise render a mock image.
- **Pi:** `python3 app/main.py --mock --once` runs cleanly; add a tiny test if there's logic worth testing.

## 5. Write it up
- `days/NNN-slug/README.md`: what it is, how to run it, data sources, what's next.
- `days/NNN-slug/LAUNCH.md`: a LinkedIn post draft (under 1,300 characters, first-person, plain words,
  one line on what was reused from earlier work, the live link, no hashtag spam). **Do not post it anywhere.**

## 6. Ship
```bash
node scripts/day.mjs ship <id>
git add -A && git commit -m "day N: ship <title>" && git push
```
Then confirm it's live (GitHub Pages takes 1–2 minutes):
```bash
gh api repos/August85/ship100/pages/builds/latest -q .status   # wait for "built"
curl -s -o /dev/null -w "%{http_code}\n" https://august85.github.io/ship100/days/NNN-slug/
```

## If it can't be finished today
If something outside your control blocks it (a data source is down, it needs hardware or an account):
```bash
node scripts/day.mjs block <id> "one-line reason"
git add -A && git commit -m "day N: blocked <title>" && git push
```
Then go back to step 0 and build the next item in the same run, so the day still ships something.
Do this at most once per run; if the second item also blocks, stop and report.

## Never
- Push with `--force`, rewrite history, or delete other days' folders.
- Change any other item's status, order or notes in `data/projects.json` (only today's item, through `scripts/day.mjs`).
- Change `data/config.json` (that's Abhimanyu's start/pause switch).
- Post to LinkedIn, X, Instagram or anywhere else; send messages or emails; buy anything; create accounts.
- Edit any repo other than this one.

## Final report (last message of the run)
Three lines: `Day N shipped: <title> — <live link>`, what it does in one sentence, and anything Abhimanyu
should look at (a blocked item, a manual step such as uploading to TestFlight or copying a .prg to the watch).

Commit messages end with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
