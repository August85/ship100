// Standup Writer: Day 21 of Ship 100.
// Plain ES module, no build step. Everything runs in the browser; inputs are saved in localStorage only.
import { buildUpdate, yesterdayLabel } from "./engine.js";

const $ = (id) => document.getElementById(id);
const KEY = "ship100.standup.v1";
const fields = ["main", "today", "blockers"];
const checks = ["group", "compact", "pastTense", "hashes"];

const EXAMPLE = {
  main: `api|a1b2c3d|feat(export): add CSV export for invoices (#412)
api|b2c3d4e|fix: off-by-one in pagination
api|c3d4e5f|wip
api|d4e5f60|fix typo
api|e5f6071|Fix typo.
web|f607182|Merge branch 'main' into dark-mode
web|0718293|feat: dark mode toggle in settings
web|1829304|chore: bump vite to 5.4.2
web|2930415|fixup! dark mode toggle in settings

Notes:
- paired with Sam on the flaky checkout e2e test
- reviewed 3 PRs`,
  today: `- finish dark mode (contrast pass)
- write the invoices migration`,
  blockers: `waiting on design review for the settings page`,
};

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: fine */ } };

function state() {
  const s = { format: document.querySelector('input[name="format"]:checked').value, label: $("label").value };
  for (const f of fields) s[f] = $(f).value;
  for (const c of checks) s[c] = $(c).checked;
  return s;
}

function apply(s) {
  for (const f of fields) if (typeof s[f] === "string") $(f).value = s[f];
  for (const c of checks) if (typeof s[c] === "boolean") $(c).checked = s[c];
  const r = s.format && document.querySelector(`input[name="format"][value="${s.format}"]`);
  if (r) r.checked = true;
  if (s.label && [...$("label").options].some((o) => o.value === s.label)) $("label").value = s.label;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
let lastText = "";

function update() {
  const s = state();
  const res = buildUpdate(s, {
    format: s.format, group: s.group, compact: s.compact, hashes: s.hashes,
    pastTense: s.pastTense, label: yesterdayLabel(new Date(), s.label),
  });
  lastText = res.text;
  $("out").textContent = res.text;
  $("compact").disabled = !s.group;

  const { commits, repos, dropped } = res.stats;
  const parts = [];
  if (commits) parts.push(plural(commits, "commit") + (repos ? ` across ${plural(repos, "repo")}` : ""));
  const merged = res.sections.y.reduce((n, i) => n + i.count - 1, 0);
  if (merged) parts.push(`${plural(merged, "duplicate")} folded in`);
  if (dropped.length) parts.push(`${dropped.length} left out`);
  $("stats").textContent = parts.join(" · ");

  $("dropped-box").hidden = !dropped.length;
  $("dropped-sum").textContent = `Left out (${dropped.length})`;
  const why = { merge: "merge commit", fixup: "fixup", noise: "too vague" };
  $("dropped").replaceChildren(...dropped.map((d) => {
    const li = document.createElement("li");
    li.textContent = `${d.repo ? d.repo + ": " : ""}${d.text} (${why[d.reason] || d.reason})`;
    return li;
  }));
  save(s);
}

let statusTimer;
async function copyUpdate() {
  const status = $("status");
  try {
    await navigator.clipboard.writeText(lastText);
    status.textContent = "Copied. Paste it into Slack.";
  } catch {
    // Clipboard blocked: select the text so Cmd/Ctrl+C works.
    const range = document.createRange();
    range.selectNodeContents($("out"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    status.textContent = "Selected. Press Cmd/Ctrl+C.";
  }
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ""; }, 2500);
}

// Commands for grabbing commits (on a Monday, look back three days).
const since = new Date().getDay() === 1 ? "3.days.ago" : "yesterday";
$("cmd-all").textContent =
  `for d in */.git; do r=\${d%/.git}; git -C "$r" log --all --since=${since} --author="$(git -C "$r" config user.email)" --format="$r|%h|%s"; done`;
$("cmd-one").textContent = `git log --all --since=${since} --author="$(git config user.email)" --oneline`;

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  const reset = () => setTimeout(() => { b.textContent = "Copy"; }, 1500);
  navigator.clipboard.writeText($(b.dataset.copy).textContent)
    .then(() => { b.textContent = "Copied"; reset(); }, () => { b.textContent = "Select it"; reset(); });
});

$("copy").addEventListener("click", copyUpdate);
$("example").addEventListener("click", () => { apply(EXAMPLE); update(); $("main").focus(); });
$("clear").addEventListener("click", () => { apply({ main: "", today: "", blockers: "" }); update(); $("main").focus(); });
const layout = document.querySelector(".layout");
layout.addEventListener("input", update);
layout.addEventListener("change", update);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); copyUpdate(); }
});

// First visit shows the example; after that, whatever you left in the boxes.
apply(load() || EXAMPLE);
update();
