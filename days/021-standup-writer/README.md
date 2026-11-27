# Standup Writer

Day 21 of [Ship 100](https://august85.github.io/ship100/). Web app.
Live: https://august85.github.io/ship100/days/021-standup-writer/

Paste your `git log` or rough notes and get a tidy yesterday / today / blockers update, grouped by repo, ready for Slack.

**Plan**
1. Main flow: paste commits and/or notes → the update appears live on the right → Copy (or Cmd/Ctrl+Enter) → paste into Slack.
2. Data: whatever you paste. No network calls. Inputs are saved in `localStorage` so the page remembers your boxes and settings.
3. Logic: `engine.js`, a rule-based parser and formatter (no LLM, no key), tested by `engine.test.mjs`.
4. Small extras: Slack / Markdown / plain output, one-line-per-repo mode, commit hashes, a "Friday" heading on Mondays, and a list of what was left out and why.
5. Out of scope: posting to Slack directly, reading GitHub/GitLab APIs, AI rewriting.

## Run it

Serve the repo root and open the folder (ES modules don't load from `file://`):

```bash
python3 -m http.server 8100   # then http://localhost:8100/days/021-standup-writer/
node days/021-standup-writer/engine.test.mjs
```

## What it understands

- `repo|hash|subject` lines, from the command on the page that walks every repo in a folder:
  `for d in */.git; do r=${d%/.git}; git -C "$r" log --all --since=yesterday --author="$(git -C "$r" config user.email)" --format="$r|%h|%s"; done`
- `git log --oneline` (also with `--graph` and `(HEAD -> main)` decorations).
- Full `git log` output (commit / Author / Date / indented message). For "Merge pull request" commits it uses the PR title from the body.
- Repo headers for pasted single-repo logs: `## api`, `[api]`, `api:`, `==> api <==`, or a path like `~/code/api`.
- Section headers in notes: `Yesterday:`, `Today:`, `Blockers:` (also `Done`, `Next`, `Todo`, `Stuck`, `Notes`, `**Today**`, `## Today`).
- Notes: bullets are stripped; `[x]` counts as done, `[ ]` as today; lines starting with "blocked", "waiting on/for", "stuck" or "need help/review" become blockers.

## Cleanup rules

- Conventional commits become sentences: `feat(api): add rate limiting (#412)` → "Added rate limiting (api) (#412)"; `fix:` → "Fixed …"; `docs:`/`test:`/`chore:`/`ci:` keep a short tag.
- Imperative verbs go to past tense ("fix" → "Fixed", "support X" → "Added support for X"). Unknown verbs are left alone. This can be turned off.
- Left out (and listed under "Left out"): merge-branch commits, `fixup!`/`squash!` commits, and vague subjects like "wip", "tmp", ".", "changes".
- Duplicates within a repo fold into one line with "(×N)".

## Decisions made on the day

- **Rules, not an LLM.** Commit subjects are already short and structured, so a parser gets most of the way with no key, no cost and nothing leaving the browser. The trade-off: it won't merge "Added export" and "Fixed export bug" into one line.
- **Separate Today and Blockers boxes.** Today's plan rarely lives in git, so it gets its own box. The main box still accepts `Today:`/`Blockers:` sections for people who keep one notes file.
- **Empty sections are explicit.** Today shows "TBD" and Blockers shows "None", so the update always has the same shape.
- **Monday handling.** The heading defaults to "Friday" and the copyable commands use `--since=3.days.ago` on Mondays.
- **Verification.** The in-app preview server wasn't available on this automated run, so the page was checked with headless Chrome against a bundled copy (desktop, dark mode, and 375px in an iframe) plus the Node tests. No console errors.

## What's next

- Fold commits that mention the same ticket (e.g. `PAY-31`) into one line.
- Optional "PRs I reviewed yesterday" import from GitHub with a bring-your-own token.
- A small shell script that prints the update straight to the clipboard.
