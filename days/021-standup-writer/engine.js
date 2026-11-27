// Standup Writer engine: turns pasted git log output and rough notes into a
// yesterday / today / blockers update. Pure functions, no DOM, so it can be tested in Node.

const SECTION_WORDS = {
  y: /^(yesterday|done|did|completed|shipped|finished|notes|other|misc|last\s+(?:working\s+)?day|friday)$/i,
  t: /^(today|next|plan|plans|todo|to\s*do|up\s*next|doing|this\s+morning)$/i,
  b: /^(blockers?|blocked|impediments?|stuck|risks?|help\s+needed|needs?)$/i,
};
const BLOCKER_LEAD = /^(blocked\b|waiting\s+(on|for)\b|stuck\b|need(s)?\s+(help|review|access|approval)\b|can'?t\b|cannot\b)/i;

const PAST = {
  add: "Added", adds: "Added", added: "Added", fix: "Fixed", fixes: "Fixed", fixed: "Fixed",
  update: "Updated", updates: "Updated", remove: "Removed", removes: "Removed", delete: "Deleted",
  refactor: "Refactored", implement: "Implemented", improve: "Improved", bump: "Bumped",
  move: "Moved", rename: "Renamed", clean: "Cleaned", cleanup: "Cleaned up", create: "Created",
  write: "Wrote", rewrite: "Rewrote", build: "Built", make: "Made", use: "Switched to",
  migrate: "Migrated", upgrade: "Upgraded", downgrade: "Downgraded", replace: "Replaced",
  enable: "Enabled", disable: "Disabled", handle: "Handled", allow: "Allowed", prevent: "Prevented",
  support: "Added support for", introduce: "Introduced", extract: "Extracted", simplify: "Simplified",
  optimize: "Optimized", speed: "Sped", document: "Documented", revert: "Reverted", merge: "Merged",
  set: "Set", change: "Changed", tweak: "Tweaked", adjust: "Adjusted", ensure: "Ensured",
  avoid: "Avoided", drop: "Dropped", deprecate: "Deprecated", configure: "Configured", wire: "Wired",
  hook: "Hooked", split: "Split", show: "Showed", hide: "Hid", deploy: "Deployed", release: "Released",
  ship: "Shipped", test: "Tested", review: "Reviewed", restore: "Restored", resolve: "Resolved",
  standardize: "Standardized", expose: "Exposed", log: "Logged", pin: "Pinned", sort: "Sorted",
  validate: "Validated", rework: "Reworked", polish: "Polished", port: "Ported", init: "Initialized",
};
const KNOWN_VERB = new Set([...Object.keys(PAST), ...Object.values(PAST).map((v) => v.split(" ")[0].toLowerCase())]);
const TYPE_LEAD = {
  feat: "Added", feature: "Added", fix: "Fixed", bugfix: "Fixed", hotfix: "Fixed", perf: "Sped up",
  refactor: "Refactored", revert: "Reverted",
};
const TYPE_TAG = { docs: "Docs", doc: "Docs", test: "Tests", tests: "Tests", ci: "CI", build: "Build", style: "Style", chore: "Chore" };
const NOISE = /^(wip|w\.i\.p\.?|\.+|tmp|temp|asdf+|x+|test|testing|stuff|changes|misc|save|commit|updates?)$/i;

const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Turn "fix parser crash" into "Fixed parser crash". Leaves unknown verbs alone. */
export function pastTense(text) {
  const m = text.match(/^([A-Za-z]+)\b(.*)$/);
  if (!m) return capFirst(text);
  const past = PAST[m[1].toLowerCase()];
  return past ? past + m[2] : capFirst(text);
}

/**
 * Clean one commit subject. Returns { text, dropped } where dropped is a reason string
 * ("merge", "fixup", "noise") when the line should not appear in the update.
 */
export function cleanSubject(raw, opts = {}) {
  const { pastTenseOn = true, body = "" } = opts;
  let s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { text: "", dropped: "noise" };
  if (/^(fixup|squash|amend)!/i.test(s)) return { text: s, dropped: "fixup" };
  const pr = s.match(/^Merge pull request (#\d+) from (\S+)/i);
  if (pr) {
    const title = body.trim() || pr[2].replace(/^[^/]+\//, "").replace(/[-_/]+/g, " ");
    return { text: `Merged PR ${pr[1]}: ${capFirst(title)}`, dropped: "" };
  }
  if (/^Merge (remote-tracking )?branch|^Merge .+ into .+|^Merged? (main|master|develop)\b/i.test(s)) return { text: s, dropped: "merge" };
  const rev = s.match(/^Revert "(.+)"$/);
  if (rev) return { text: `Reverted: ${rev[1]}`, dropped: "" };
  if (NOISE.test(s.replace(/[!.]+$/, ""))) return { text: s, dropped: "noise" };

  let scope = "";
  const cc = s.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/i);
  if (cc && (TYPE_LEAD[cc[1].toLowerCase()] || TYPE_TAG[cc[1].toLowerCase()])) {
    const type = cc[1].toLowerCase();
    scope = cc[2] || "";
    let desc = cc[3].trim();
    const first = (desc.match(/^[A-Za-z]+/) || [""])[0].toLowerCase();
    if (TYPE_LEAD[type]) {
      if (KNOWN_VERB.has(first)) s = pastTenseOn ? pastTense(desc) : capFirst(desc);
      else s = `${TYPE_LEAD[type]} ${desc}`;
    } else {
      s = `${TYPE_TAG[type]}: ${pastTenseOn ? pastTense(desc) : capFirst(desc)}`;
    }
  } else {
    s = pastTenseOn ? pastTense(s) : capFirst(s);
  }
  s = s.replace(/\s*\.+$/, "");
  if (scope) {
    // Keep a trailing ticket/PR reference last: "Added export (api) (#412)".
    const ref = s.match(/\s*(\((?:#\d+|[A-Z][A-Z0-9]+-\d+)\))$/);
    s = ref ? `${s.slice(0, ref.index)} (${scope}) ${ref[1]}` : `${s} (${scope})`;
  }
  return { text: s, dropped: "" };
}

const stripBullet = (line) => {
  let done = null;
  let s = line.replace(/^\s*(?:[-*•◦▪+]|\d+[.)])\s+/, "");
  const box = s.match(/^\[([ xX✓])\]\s*/);
  if (box) { done = box[1] !== " "; s = s.slice(box[0].length); }
  return { text: s.trim(), done };
};

function repoHeader(line) {
  const t = line.trim();
  let m;
  if ((m = t.match(/^==>\s*(.+?)\s*<==$/))) return base(m[1]);
  if ((m = t.match(/^#{1,4}\s+(.+?)\s*:?$/))) return sectionOf(m[1]) ? null : base(m[1]);
  if ((m = t.match(/^\[([\w.\-/ ]+)\]$/))) return base(m[1]);
  if ((m = t.match(/^(~|\.{0,2}\/)\S*$/))) return base(t);
  if ((m = t.match(/^([\w.\-/]+):$/)) && !sectionOf(m[1])) return base(m[1]);
  return null;
}
const base = (p) => p.replace(/\/+$/, "").split("/").pop().trim();
function sectionOf(word) {
  const w = word.trim().replace(/:$/, "").replace(/^\*+|\*+$/g, "").trim();
  for (const k of ["y", "t", "b"]) if (SECTION_WORDS[k].test(w)) return k;
  return null;
}

/**
 * Parse pasted text. Understands:
 *   repo|hash|subject   (the multi-repo command on the page)
 *   abc1234 subject     (git log --oneline, with or without --graph and decorations)
 *   full `git log` output (commit / Author / Date / indented message)
 *   repo headers: "## api", "[api]", "api:", "==> api <==", "~/code/api"
 *   section headers: "Yesterday:", "Today:", "Blockers:" (with or without bullets on the next lines)
 *   anything else is a note: bullets are stripped; "[x]" = done, "[ ]" = today; "blocked on…" = blocker
 * `defaultSection` is where notes go before any section header ("y" for the main box).
 */
export function parse(text, { defaultSection = "y", pastTenseOn = true } = {}) {
  const items = [];
  const dropped = [];
  let section = defaultSection;
  let repo = "";
  let commit = null; // { hash, subject, body }
  let commits = 0;

  const pushCommit = (repoName, hash, subject, body = "") => {
    commits++;
    const c = cleanSubject(subject, { pastTenseOn, body });
    const entry = { section: "y", repo: repoName, text: c.text, hash: hash.slice(0, 7), kind: "commit" };
    if (c.dropped) dropped.push({ ...entry, reason: c.dropped });
    else items.push(entry);
  };
  const flush = () => {
    if (commit && commit.subject) pushCommit(repo, commit.hash, commit.subject, commit.body);
    commit = null;
  };

  for (const rawLine of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/\t/g, "    ");
    const t = line.trim();

    // Full `git log` format
    let m = t.match(/^commit ([0-9a-f]{7,40})\b/);
    if (m) { flush(); commit = { hash: m[1], subject: "", body: "" }; continue; }
    if (commit) {
      if (/^(Author|AuthorDate|Commit|CommitDate|Date|Merge):/.test(t)) continue;
      if (!t) continue;
      if (/^\s{2,}/.test(line)) {
        if (!commit.subject) commit.subject = t;
        else if (!commit.body) commit.body = t;
        continue;
      }
      flush();
    }
    if (!t) continue;
    if (/^[|\\/*\s]+$/.test(t)) continue; // bare --graph lines

    // repo|hash|subject
    m = t.match(/^([^|\s]+)\|([0-9a-f]{4,40})\|(.*)$/);
    if (m) { pushCommit(m[1], m[2], m[3]); continue; }

    // --oneline (optionally with --graph prefix and (HEAD -> main) decorations)
    m = t.match(/^[*|\\/ ]*([0-9a-f]{7,40})\s+(?:\([^)]*\)\s+)?(.+)$/);
    if (m && /\d/.test(m[1])) { pushCommit(repo, m[1], m[2]); continue; }

    // Section header ("Today:" or "**Today**" or "## Today"), possibly with inline content
    m = t.match(/^(?:#{1,4}\s*)?\**([A-Za-z][A-Za-z ]{1,20}?)\**\s*(?::\s*(.*))?$/);
    if (m) {
      const sec = sectionOf(m[1]);
      if (sec && (m[2] !== undefined || /^(#|\*)/.test(t) || t.split(/\s+/).length <= 2)) {
        const rest = (m[2] || "").trim();
        if (rest) addNote(rest, sec);
        else { section = sec; repo = ""; }
        continue;
      }
    }

    // Repo header
    const r = repoHeader(t);
    if (r) { repo = r; if (section !== "y") section = "y"; continue; }

    addNote(t, section);
  }
  flush();

  function addNote(t, sec) {
    const { text: s, done } = stripBullet(t);
    if (!s) return;
    let target = sec;
    if (done === true) target = "y";
    else if (done === false) target = "t";
    if (BLOCKER_LEAD.test(s)) target = "b";
    const tidy = capFirst(s.replace(/\s*\.+$/, ""));
    items.push({ section: target, repo: target === "y" ? repo : "", text: tidy, hash: "", kind: "note" });
  }

  return { items, dropped, commits };
}

/** Merge exact duplicates (case-insensitive) within a section and repo; repeated lines get "(×N)". */
export function dedupe(items) {
  const out = [];
  const seen = new Map();
  for (const it of items) {
    const key = `${it.section}|${it.repo}|${it.text.toLowerCase().replace(/[^\w#]+/g, " ").trim()}`;
    if (seen.has(key)) { seen.get(key).count++; continue; }
    const copy = { ...it, count: 1, hashes: it.hash ? [it.hash] : [] };
    seen.set(key, copy);
    out.push(copy);
  }
  for (const it of items) if (it.hash) {
    const key = `${it.section}|${it.repo}|${it.text.toLowerCase().replace(/[^\w#]+/g, " ").trim()}`;
    const o = seen.get(key);
    if (!o.hashes.includes(it.hash)) o.hashes.push(it.hash);
  }
  return out;
}

/** Label for the "yesterday" section: on a Monday the last working day was Friday. */
export function yesterdayLabel(date = new Date(), mode = "auto") {
  if (mode === "yesterday") return "Yesterday";
  if (mode === "friday") return "Friday";
  if (mode === "since") return "Since last standup";
  return date.getDay() === 1 ? "Friday" : "Yesterday";
}

const STYLES = {
  slack: { h: (s) => `*${s}*`, repo: (s) => `*${s}*`, b: "•", sub: "    ◦", code: (s) => `\`${s}\``, blank: (s) => `_${s}_` },
  markdown: { h: (s) => `**${s}**`, repo: (s) => `**${s}**`, b: "-", sub: "  -", code: (s) => `\`${s}\``, blank: (s) => `_${s}_` },
  plain: { h: (s) => s, repo: (s) => s, b: "-", sub: "    -", code: (s) => s, blank: (s) => s },
};

/**
 * Build the update text.
 * sections: { y: items[], t: items[], b: items[] } (already deduped)
 * opts: { format: "slack"|"markdown"|"plain", group: bool, hashes: bool, label: string }
 */
export function render(sections, opts = {}) {
  const st = STYLES[opts.format] || STYLES.slack;
  const label = opts.label || "Yesterday";
  const line = (it, bullet) => {
    let s = it.text;
    if (it.count > 1) s += ` (×${it.count})`;
    if (opts.hashes && it.hashes && it.hashes.length) s += " " + it.hashes.slice(0, 3).map(st.code).join(" ");
    return `${bullet} ${s}`;
  };
  const out = [];

  out.push(st.h(label));
  const y = sections.y || [];
  if (!y.length) out.push(`${st.b} ${st.blank("Nothing logged")}`);
  else {
    const repos = [...new Set(y.map((i) => i.repo))];
    const named = repos.filter(Boolean);
    if (opts.group && named.length) {
      // Each repo in the order it appeared, then notes that belong to no repo.
      for (const r of named) {
        const rs = y.filter((i) => i.repo === r);
        if (opts.compact) out.push(`${st.b} ${st.repo(r)}: ${rs.map((i) => line(i, "").trim()).join("; ")}`);
        else {
          out.push(`${st.b} ${st.repo(r)}`);
          for (const it of rs) out.push(line(it, st.sub));
        }
      }
      for (const it of y.filter((i) => !i.repo)) out.push(line(it, st.b));
    } else {
      for (const it of y) out.push(line({ ...it, text: !opts.group && it.repo && named.length > 1 ? `${it.repo}: ${it.text}` : it.text }, st.b));
    }
  }

  out.push("", st.h("Today"));
  const t = sections.t || [];
  if (!t.length) out.push(`${st.b} ${st.blank("TBD")}`);
  for (const it of t) out.push(line(it, st.b));

  out.push("", st.h("Blockers"));
  const b = sections.b || [];
  if (!b.length) out.push(`${st.b} None`);
  for (const it of b) out.push(line(it, st.b));

  return out.join("\n");
}

/** Parse the three boxes and return { text, stats }. */
export function buildUpdate({ main = "", today = "", blockers = "" }, opts = {}) {
  const p1 = parse(main, { defaultSection: "y", pastTenseOn: opts.pastTense !== false });
  const p2 = parse(today, { defaultSection: "t", pastTenseOn: opts.pastTense !== false });
  const p3 = parse(blockers, { defaultSection: "b", pastTenseOn: opts.pastTense !== false });
  // Notes typed into the Today / Blockers boxes stay there even without a header.
  const fromToday = p2.items.map((i) => (i.kind === "note" && i.section === "y" ? { ...i, section: "t", repo: "" } : i));
  const fromBlockers = p3.items.map((i) => (i.kind === "note" ? { ...i, section: "b", repo: "" } : i));
  let all = [...p1.items, ...fromToday, ...fromBlockers];
  if (opts.dedupe !== false) all = dedupe(all);
  else all = all.map((i) => ({ ...i, count: 1, hashes: i.hash ? [i.hash] : [] }));
  const sections = { y: all.filter((i) => i.section === "y"), t: all.filter((i) => i.section === "t"), b: all.filter((i) => i.section === "b") };
  const dropped = [...p1.dropped, ...p2.dropped, ...p3.dropped];
  const repos = new Set(sections.y.map((i) => i.repo).filter(Boolean));
  return {
    text: render(sections, opts),
    sections,
    stats: { commits: p1.commits + p2.commits + p3.commits, repos: repos.size, lines: all.length, dropped },
  };
}
