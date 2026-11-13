# Ship 100

One product a day for 100 days. Public repo, served by GitHub Pages at https://august85.github.io/ship100/.

- `index.html` + `assets/`: the tracker page. Anyone can read it; the owner edits through the GitHub API with a fine-grained token kept in their browser.
- `data/projects.json`: the idea list and its status (`idea`, `approved`, `building`, `shipped`, `blocked`, `skipped`). Ordered by `order`.
- `data/config.json`: `started` / `paused` switch, set from the tracker page.
- `days/NNN-slug/`: one folder per shipped day.
- `templates/`: starters for web, landing pages, iOS (XcodeGen), Garmin (Connect IQ) and Raspberry Pi.
- `scripts/day.mjs`: the only thing that should change an item's status during a daily build.
- `RUNNER.md`: the daily build procedure. A scheduled task runs it every day at 6:00 AM.

Rules: no build step on web pages; no secrets or personal data in the repo; never edit Abhimanyu's other repos in `~/code`, only read them.
