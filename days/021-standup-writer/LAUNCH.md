# LinkedIn post draft (not posted)

Day 21 of 100: Standup Writer.

Every morning I do the same small chore: scroll through yesterday's commits across a few repos and turn "fix typo", "wip" and "feat(api): add rate limiting" into something a human wants to read in Slack.

So today I built a page for it. Paste your git log (or rough notes, or both) and it writes the update for you:

• Yesterday, grouped by repo, in plain past-tense sentences
• Today and Blockers from a couple of quick lines
• Merge commits, fixups and "wip" quietly left out (and listed, so nothing disappears silently)
• Slack, Markdown or plain text, one click to copy

There's a one-line shell command on the page that pulls yesterday's commits from every repo in a folder, with the repo names attached. On Mondays it looks back to Friday.

No AI, no sign-up, no tracking. It's a few hundred lines of parsing rules, and everything stays in your browser.

Reused: nothing this time. It's new code, built in the same no-build-step style as the other Ship 100 web apps.

Follow along: https://august85.github.io/ship100/
Today's app: https://august85.github.io/ship100/days/021-standup-writer/
