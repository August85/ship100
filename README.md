# Ship 100

One product, app or web portal a day, for 100 days, by [Abhimanyu Katyayan](https://www.linkedin.com/in/abhimanyu-katyayan/).

**Tracker:** https://august85.github.io/ship100/: the full plan, what's shipped, and what's next.

Each day's product lives in [`days/`](days/) and is live at `https://august85.github.io/ship100/days/NNN-name/`.

## How it works
1. The 100 ideas are in [`data/projects.json`](data/projects.json) (first written up in [IDEAS.md](IDEAS.md)).
2. On the tracker page the owner can approve, skip, reorder, edit and add ideas, then press **Start**.
3. Every morning a scheduled Claude Code task follows [RUNNER.md](RUNNER.md): it picks the next approved idea
   (or the next unreviewed one if nothing is approved), builds it from a template, tests it, writes it up,
   and pushes. GitHub Pages publishes it.

## Editing the tracker
Click **Sign in to edit** and paste a fine-grained GitHub token limited to this repo with
*Contents: read and write*. The token stays in your browser. GitHub only accepts saves from accounts with
write access to this repo, so the page is read-only for everyone else.

## Local preview
```bash
python3 -m http.server 8100
```
Then open http://localhost:8100.
