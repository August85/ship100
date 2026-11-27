import assert from "node:assert/strict";
import { cleanSubject, pastTense, parse, dedupe, buildUpdate, yesterdayLabel } from "./engine.js";

// Subject cleanup
assert.equal(cleanSubject("feat(api): add rate limiting").text, "Added rate limiting (api)");
assert.equal(cleanSubject("feat: login page").text, "Added login page");
assert.equal(cleanSubject("fix: null check in parser.").text, "Fixed null check in parser");
assert.equal(cleanSubject("docs: update README").text, "Docs: Updated README");
assert.equal(cleanSubject("fix typo in footer").text, "Fixed typo in footer");
assert.equal(cleanSubject("fix typo in footer", { pastTenseOn: false }).text, "Fix typo in footer");
assert.equal(cleanSubject("Merge branch 'main' into feature/x").dropped, "merge");
assert.equal(cleanSubject("Merge remote-tracking branch 'origin/main'").dropped, "merge");
assert.equal(cleanSubject("fixup! add rate limiting").dropped, "fixup");
assert.equal(cleanSubject("wip").dropped, "noise");
assert.equal(cleanSubject("WIP.").dropped, "noise");
assert.equal(cleanSubject("Merge pull request #412 from ak/rate-limit").text, "Merged PR #412: Rate limit");
assert.equal(cleanSubject("Merge pull request #412 from ak/rate-limit", { body: "Rate limit the export API" }).text, "Merged PR #412: Rate limit the export API");
assert.equal(cleanSubject('Revert "add cache"').text, "Reverted: add cache");
assert.equal(pastTense("support dark mode"), "Added support for dark mode");
assert.equal(pastTense("Investigated flaky test"), "Investigated flaky test");

assert.equal(cleanSubject("feat(export): add CSV export (#412)").text, "Added CSV export (export) (#412)");
assert.equal(cleanSubject("fix(auth): token refresh (PAY-31)").text, "Fixed token refresh (auth) (PAY-31)");

// Multi-repo pipe format + notes
const multi = `api|a1b2c3d|feat: add rate limiting (#412)
api|b2c3d4e|fix: off-by-one in pagination
api|c3d4e5f|wip
web|d4e5f60|chore: bump vite to 5.4.2
web|e5f6071|Merge branch 'main' into dark-mode
Today:
- finish dark mode
- [ ] write migration
Blocked on design review for the settings page`;
let p = parse(multi);
assert.equal(p.commits, 5);
assert.equal(p.dropped.length, 2);
assert.deepEqual(p.items.filter((i) => i.section === "y").map((i) => [i.repo, i.text]), [
  ["api", "Added rate limiting (#412)"],
  ["api", "Fixed off-by-one in pagination"],
  ["web", "Chore: Bumped vite to 5.4.2"],
]);
assert.deepEqual(p.items.filter((i) => i.section === "t").map((i) => i.text), ["Finish dark mode", "Write migration"]);
assert.deepEqual(p.items.filter((i) => i.section === "b").map((i) => i.text), ["Blocked on design review for the settings page"]);

// --oneline with graph + decorations, under a repo header
p = parse(`## billing
* 9f8e7d6 (HEAD -> main, origin/main) Fix rounding on invoices
* 1a2b3c4 Add VAT field
|
* 5d6e7f8 Merge pull request #88 from ak/vat`);
assert.deepEqual(p.items.map((i) => [i.repo, i.text]), [
  ["billing", "Fixed rounding on invoices"],
  ["billing", "Added VAT field"],
  ["billing", "Merged PR #88: Vat"],
]);

// Full git log format
p = parse(`commit 3f2a9c1e7b0d4a5f6e7d8c9b0a1f2e3d4c5b6a79
Author: Someone <someone@example.com>
Date:   Wed Nov 26 17:02:11 2026 -0800

    feat(search): add fuzzy matching

    Uses trigram similarity.

commit 4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b
Merge: 1111111 2222222
Author: Someone <someone@example.com>
Date:   Wed Nov 26 16:00:00 2026 -0800

    Merge pull request #7 from ak/fuzzy

    Fuzzy search for the command bar
`);
assert.deepEqual(p.items.map((i) => [i.text, i.hash]), [
  ["Added fuzzy matching (search)", "3f2a9c1"],
  ["Merged PR #7: Fuzzy search for the command bar", "4a5b6c7"],
]);

// Rough notes with sections and checkboxes
p = parse(`Yesterday
- paired with Sam on the flaky e2e test
- [x] reviewed 3 PRs
**Today**
- [ ] ship the onboarding email
Blockers: waiting on legal sign-off`);
assert.deepEqual(p.items.map((i) => [i.section, i.text]), [
  ["y", "Paired with Sam on the flaky e2e test"],
  ["y", "Reviewed 3 PRs"],
  ["t", "Ship the onboarding email"],
  ["b", "Waiting on legal sign-off"],
]);

// A note line that only looks like a repo/section is still a note
p = parse("Note: deploy window moved to 3pm");
assert.equal(p.items[0].text, "Note: deploy window moved to 3pm");

// "Notes:" ends the current repo group
p = parse("web|1234567|fix x\nNotes:\n- reviewed 3 PRs");
assert.deepEqual(p.items.map((i) => [i.repo, i.text]), [["web", "Fixed x"], ["", "Reviewed 3 PRs"]]);

// Dedupe
const d = dedupe(parse(`api|1111111|fix typo\napi|2222222|Fix typo.\napi|3333333|fix typo`).items);
assert.equal(d.length, 1);
assert.equal(d[0].count, 3);
assert.deepEqual(d[0].hashes, ["1111111", "2222222", "3333333"]);

// Full render, Slack
let out = buildUpdate({ main: multi + "\nNotes:\n- loose note" }, { format: "slack", group: true, label: "Yesterday" });
assert.equal(out.text, `*Yesterday*
• *api*
    ◦ Added rate limiting (#412)
    ◦ Fixed off-by-one in pagination
• *web*
    ◦ Chore: Bumped vite to 5.4.2
• Loose note

*Today*
• Finish dark mode
• Write migration

*Blockers*
• Blocked on design review for the settings page`);
assert.equal(out.stats.commits, 5);
assert.equal(out.stats.repos, 2);
assert.equal(out.stats.dropped.length, 2);

// Markdown, compact, hashes
out = buildUpdate({ main: "api|a1b2c3d|fix: crash\napi|b2c3d4e|feat: export", today: "demo prep", blockers: "" }, { format: "markdown", group: true, compact: true, hashes: true });
assert.equal(out.text, `**Yesterday**
- **api**: Fixed crash \`a1b2c3d\`; Added export \`b2c3d4e\`

**Today**
- Demo prep

**Blockers**
- None`);

// Ungrouped with several repos prefixes the repo name; empty sections get placeholders
out = buildUpdate({ main: "a|1234567|fix x\nb|2345678|fix y" }, { format: "plain", group: false });
assert.equal(out.text, "Yesterday\n- a: Fixed x\n- b: Fixed y\n\nToday\n- TBD\n\nBlockers\n- None");
assert.match(buildUpdate({}, {}).text, /Nothing logged/);

// Labels
assert.equal(yesterdayLabel(new Date(2026, 10, 30)), "Friday"); // Monday
assert.equal(yesterdayLabel(new Date(2026, 10, 27)), "Yesterday"); // Friday
assert.equal(yesterdayLabel(new Date(2026, 10, 27), "since"), "Since last standup");

console.log("engine tests passed");
