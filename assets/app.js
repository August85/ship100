"use strict";
// Ship 100 tracker. Anyone can read; saving writes data/*.json through the GitHub API
// with the owner's fine-grained token, which never leaves their browser.

const REPO = "August85/ship100";
const API = "https://api.github.com";
const PROJECTS = "data/projects.json";
const CONFIG = "data/config.json";
const PAGES = "https://august85.github.io/ship100/";
const LS_TOKEN = "ship100:token";
const LS_DRAFT = "ship100:draft";
const LS_VIEW = "ship100:view";

const STATUSES = {
  idea: "Idea", approved: "Approved", building: "Building", shipped: "Shipped", blocked: "Blocked", skipped: "Skipped",
};
const STATUS_RANK = { building: 0, approved: 1, idea: 2, blocked: 3, shipped: 4, skipped: 5 };
const STACKS = { web: "Web", ios: "iOS", garmin: "Garmin", pi: "Raspberry Pi" };
const EFFORT_RANK = { S: 0, M: 1, L: 2 };
// Fields the daily builder owns; local edits to them only win if the builder hasn't touched them.
const FIELDS = ["order", "title", "summary", "theme", "stack", "reuses", "status", "effort", "notes", "slug", "links", "day", "shippedAt", "createdAt"];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const S = {
  items: [], base: [], config: {}, baseConfig: {},
  dirty: new Set(), deleted: new Set(), configDirty: false,
  token: store.get(LS_TOKEN), login: null, canEdit: false,
  sort: "order", dir: 1, editing: null, dragId: null,
};

// ---------- GitHub API ----------
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${S.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `GitHub error ${res.status}`); err.status = res.status; throw err;
  }
  return res.json();
}
// repo.permissions reflects the *account*, not the token, so a read-only token passes it.
// Probe with a PUT whose sha can never match: a token that may write gets 409/422 (nothing is written),
// a token that may not gets 403/404.
async function tokenCanWrite() {
  try {
    await gh(`/repos/${REPO}/contents/${CONFIG}`, {
      method: "PUT",
      body: JSON.stringify({ message: "write check", sha: "0".repeat(40), branch: "main", content: b64encode("{}\n") }),
    });
    return true;
  } catch (e) { return !(e.status === 403 || e.status === 404); }
}
const TOKEN_HELP = "This token can read the repo but not save to it. Create a new fine-grained token with Repository access → Only select repositories → ship100, and Permissions → Contents → Read and write.";

async function readFile(path) {
  const r = await gh(`/repos/${REPO}/contents/${path}?ref=main&t=${Date.now()}`, { cache: "no-store" });
  return { sha: r.sha, json: JSON.parse(b64decode(r.content)) };
}
async function writeFile(path, json, sha, message) {
  return gh(`/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, sha, branch: "main", content: b64encode(JSON.stringify(json, null, 2) + "\n") }),
  });
}

// ---------- Load ----------
async function load() {
  let projects, config;
  if (S.token) {
    try {
      const me = await gh("/user");
      const repo = await gh(`/repos/${REPO}`);
      S.login = me.login; S.canEdit = !!repo.permissions?.push && (await tokenCanWrite());
      if (!S.canEdit) toast(TOKEN_HELP, 12000);
      [projects, config] = await Promise.all([readFile(PROJECTS), readFile(CONFIG)]);
      projects = projects.json; config = config.json;
    } catch (e) {
      if (e.status === 401) { store.set(LS_TOKEN, null); S.token = null; toast("Your token expired or was revoked. Sign in again."); }
      else toast(`Couldn't reach GitHub (${e.message}). Showing the published copy.`);
      S.canEdit = false;
    }
  }
  if (!projects) {
    const bust = `?t=${Date.now()}`;
    [projects, config] = await Promise.all([
      fetch(PROJECTS + bust, { cache: "no-store" }).then((r) => r.json()),
      fetch(CONFIG + bust, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
  }
  S.base = clone(projects.items); S.items = clone(projects.items);
  S.baseConfig = clone(config); S.config = clone(config);
  if (S.canEdit) restoreDraft();
  render();
}

// ---------- Drafts (unsaved edits survive a reload) ----------
function saveDraft() {
  if (!S.dirty.size && !S.deleted.size && !S.configDirty) return store.set(LS_DRAFT, null);
  store.set(LS_DRAFT, JSON.stringify({
    items: S.items.filter((i) => S.dirty.has(i.id)), deleted: [...S.deleted], config: S.configDirty ? S.config : null,
  }));
}
function restoreDraft() {
  let d; try { d = JSON.parse(store.get(LS_DRAFT) || "null"); } catch { d = null; }
  if (!d) return;
  for (const it of d.items || []) {
    const i = S.items.findIndex((x) => x.id === it.id);
    i >= 0 ? (S.items[i] = it) : S.items.push(it);
    S.dirty.add(it.id);
  }
  for (const id of d.deleted || []) { S.items = S.items.filter((x) => x.id !== id); S.deleted.add(id); }
  if (d.config) { S.config = d.config; S.configDirty = true; }
}
function markDirty(id) { S.dirty.add(id); saveDraft(); render(); }

// ---------- Save (3-way merge so the daily builder's commits are never overwritten) ----------
function merge3(base, local, remote, keys) {
  if (!remote) return local;
  if (!base) return local;
  const out = { ...remote };
  for (const k of keys) {
    const localChanged = !same(local[k], base[k]);
    const remoteChanged = !same(remote[k], base[k]);
    out[k] = localChanged && !remoteChanged ? local[k] : remoteChanged && !localChanged ? remote[k] : localChanged ? local[k] : remote[k];
  }
  // Never let a stale page move a shipped/building item back.
  if (["shipped", "building"].includes(remote.status) && !same(remote.status, base.status)) {
    for (const k of ["status", "day", "shippedAt", "links"]) out[k] = remote[k];
  }
  return out;
}
async function save() {
  const btn = $("#saveBtn"); btn.disabled = true; $("#saveMsg").textContent = "Saving…";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await saveOnce(); break; }
      catch (e) { if (e.status === 409 && attempt === 0) continue; throw e; }
    }
    S.dirty.clear(); S.deleted.clear(); S.configDirty = false; saveDraft();
    toast("Saved. The public page updates in about a minute.");
  } catch (e) {
    const help = e.status === 403 || e.status === 404 ? TOKEN_HELP : e.status === 401 ? "Your token expired or was revoked. Sign out and sign in again." : e.message;
    toast(`Save failed. ${help} Your changes are kept in this browser.`, 12000);
  } finally { btn.disabled = false; render(); }
}
async function saveOnce() {
  const n = S.dirty.size + S.deleted.size;
  if (n) {
    const remote = await readFile(PROJECTS);
    const baseById = new Map(S.base.map((i) => [i.id, i]));
    const map = new Map(remote.json.items.map((i) => [i.id, i]));
    for (const id of S.dirty) {
      const local = S.items.find((i) => i.id === id); if (!local) continue;
      map.set(id, merge3(baseById.get(id), local, map.get(id), FIELDS));
    }
    for (const id of S.deleted) map.delete(id);
    const items = [...map.values()].sort((a, b) => a.order - b.order);
    const json = { ...remote.json, items };
    await writeFile(PROJECTS, json, remote.sha, `tracker: update ${n} item${n > 1 ? "s" : ""}`);
    S.base = clone(items); S.items = clone(items);
  }
  if (S.configDirty) {
    const remote = await readFile(CONFIG);
    const json = merge3(S.baseConfig, S.config, remote.json, Object.keys({ ...S.config, ...remote.json }));
    await writeFile(CONFIG, json, remote.sha, `tracker: ${json.started ? (json.paused ? "pause" : "start/resume") : "update"} run`);
    S.baseConfig = clone(json); S.config = clone(json);
  }
}
function discard() {
  if (!confirm("Discard all unsaved changes?")) return;
  S.items = clone(S.base); S.config = clone(S.baseConfig);
  S.dirty.clear(); S.deleted.clear(); S.configDirty = false; saveDraft(); render();
}

// ---------- Derived ----------
function nextUp() {
  const open = S.items.filter((i) => i.status === "approved").sort((a, b) => a.order - b.order);
  if (open.length) return open[0];
  if (S.config.autoPickUnreviewed === false) return null;
  return S.items.filter((i) => i.status === "idea").sort((a, b) => a.order - b.order)[0] || null;
}
function streak() {
  const days = new Set(S.items.filter((i) => i.shippedAt).map((i) => i.shippedAt.slice(0, 10)));
  let n = 0; const d = new Date();
  if (!days.has(d.toLocaleDateString("en-CA"))) d.setDate(d.getDate() - 1); // today's build may not have run yet
  while (days.has(d.toLocaleDateString("en-CA"))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function liveLink(i) { return i.links?.live || ""; }

// ---------- Render ----------
function render() {
  const shipped = S.items.filter((i) => i.status === "shipped");
  $("#shippedCount").textContent = shipped.length;
  $("#ring").style.setProperty("--p", Math.min(100, shipped.length));
  $("#dayNum").textContent = S.config.started ? Math.min(100, shipped.length + 1) : 0;
  $("#streak").textContent = streak();
  $("#approvedCount").textContent = S.items.filter((i) => i.status === "approved").length;
  const nu = nextUp(); $("#nextUp").textContent = nu ? `#${nu.order} ${nu.title}` : "Nothing queued";

  const c = S.config;
  $("#runState").textContent = !c.started ? "Not started" : c.paused ? "Paused" : "Running daily";
  $("#runHint").textContent = !c.started ? "Review the list, then press Start."
    : c.paused ? "No builds until you resume."
    : `Builds every day at ${fmtTime(c.dailyTime)}. Started ${c.startDate}.`;
  $("#runControls").hidden = !S.canEdit;
  $("#startBtn").textContent = !c.started ? "Start the 100 days" : c.paused ? "Resume" : "Running";
  $("#startBtn").disabled = c.started && !c.paused;
  $("#pauseBtn").hidden = !(c.started && !c.paused);

  $("#signin").textContent = S.token ? "Sign out" : "Sign in to edit";
  $("#whoami").hidden = !S.login;
  $("#whoami").textContent = S.login ? `${S.login} · ${S.canEdit ? "can edit" : "read only"}` : "";
  $("#addBtn").hidden = !S.canEdit;

  fillFilters();
  renderList();
  renderLog(shipped);

  const n = S.dirty.size + S.deleted.size + (S.configDirty ? 1 : 0);
  $("#savebar").hidden = !n;
  $("#saveMsg").textContent = `${n} unsaved change${n === 1 ? "" : "s"}`;
}
function fmtTime(t = "06:00") {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fillFilters() {
  const themes = [...new Set(S.items.map((i) => i.theme))];
  setOptions($("#fTheme"), "All themes", themes.map((t) => [t, t]));
  setOptions($("#fStatus"), "All statuses", Object.entries(STATUSES));
  setOptions($("#fStack"), "All platforms", Object.entries(STACKS));
  $("#themeList").innerHTML = themes.map((t) => `<option value="${esc(t)}">`).join("");
}
function setOptions(sel, all, pairs) {
  const v = sel.value; const key = JSON.stringify(pairs);
  if (sel.dataset.key === key) return;
  sel.dataset.key = key;
  sel.innerHTML = `<option value="">${all}</option>` + pairs.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join("");
  sel.value = sel.dataset.want || v; // dataset.want = filter remembered from the last visit
  sel.dataset.want = "";
}
function filtered() {
  const q = $("#q").value.trim().toLowerCase();
  const th = $("#fTheme").value, st = $("#fStatus").value, sk = $("#fStack").value;
  let list = S.items.filter((i) =>
    (!th || i.theme === th) && (!st || i.status === st) && (!sk || i.stack === sk) &&
    (!q || `${i.title} ${i.summary} ${i.theme} ${i.notes} ${(i.reuses || []).join(" ")}`.toLowerCase().includes(q)));
  const by = {
    order: (a, b) => a.order - b.order,
    title: (a, b) => a.title.localeCompare(b.title),
    theme: (a, b) => a.theme.localeCompare(b.theme) || a.order - b.order,
    status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.order - b.order,
    stack: (a, b) => a.stack.localeCompare(b.stack) || a.order - b.order,
    effort: (a, b) => EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort] || a.order - b.order,
    shipped: (a, b) => (b.shippedAt || "").localeCompare(a.shippedAt || "") || a.order - b.order,
  }[S.sort];
  list.sort((a, b) => by(a, b) * S.dir);
  return list;
}
function renderList() {
  const list = filtered();
  const canDrag = S.canEdit && S.sort === "order" && S.dir === 1 && !$("#q").value && !$("#fTheme").value && !$("#fStatus").value && !$("#fStack").value;
  const groupKey = { theme: (i) => i.theme, status: (i) => STATUSES[i.status], stack: (i) => STACKS[i.stack] }[S.sort];
  $("#count").textContent = `${list.length} of ${S.items.length}`;
  let html = "", last = null;
  for (const i of list) {
    if (groupKey && groupKey(i) !== last) { last = groupKey(i); html += `<h2 class="group-h">${esc(last)}</h2>`; }
    const live = liveLink(i);
    html += `<article class="row ${S.dirty.has(i.id) ? "dirty" : ""} is-${i.status}" data-id="${esc(i.id)}" ${canDrag ? 'draggable="true"' : ""} tabindex="0">
      <div class="num">${canDrag ? '<span class="handle" title="Drag to reorder">⋮⋮</span> ' : ""}${i.order}</div>
      <div>
        <h3>${esc(i.title)}</h3>
        <p>${esc(i.summary)}</p>
        <div class="tags">
          <span class="tag">${esc(i.theme)}</span>
          <span class="tag">${esc(STACKS[i.stack] || i.stack)}</span>
          <span class="tag">Effort ${esc(i.effort)}</span>
          ${(i.reuses || []).map((r) => `<span class="tag reuse">${esc(r)}</span>`).join("")}
          ${i.day ? `<span class="tag">Day ${i.day}</span>` : ""}
        </div>
      </div>
      <div class="side">
        <span class="pill" style="--c: var(--s-${esc(i.status)})">${esc(STATUSES[i.status] || i.status)}</span>
        ${live || i.links?.code ? `<div class="links">${live ? `<a href="${esc(live)}" target="_blank" rel="noopener" data-stop>Open ↗</a>` : ""}${i.links?.code ? `<a href="${esc(i.links.code)}" target="_blank" rel="noopener" data-stop>Code</a>` : ""}</div>` : ""}
        ${S.canEdit && ["idea", "approved", "skipped"].includes(i.status) ? `<div class="quick">
          <button class="btn tiny" data-act="approve" data-stop>${i.status === "approved" ? "Unapprove" : "Approve"}</button>
          <button class="btn tiny ghost" data-act="skip" data-stop>${i.status === "skipped" ? "Restore" : "Skip"}</button>
        </div>` : ""}
      </div>
    </article>`;
  }
  $("#list").innerHTML = html || `<p class="muted">No ideas match these filters.</p>`;
}
function renderLog(shipped) {
  const rows = shipped.slice().sort((a, b) => (b.day || 0) - (a.day || 0));
  $("#logEmpty").hidden = rows.length > 0;
  $("#log").innerHTML = rows.map((i) => `<li><span class="d">Day ${i.day ?? "?"}</span>
    <span><b>${esc(i.title)}</b> <span class="muted small">${esc((i.shippedAt || "").slice(0, 10))}</span></span>
    <span class="spacer"></span>
    ${liveLink(i) ? `<a href="${esc(liveLink(i))}" target="_blank" rel="noopener">Open ↗</a>` : ""}
    ${i.links?.code ? `<a href="${esc(i.links.code)}" target="_blank" rel="noopener">Code</a>` : ""}
    ${i.links?.post ? `<a href="${esc(i.links.post)}" target="_blank" rel="noopener">Post</a>` : ""}</li>`).join("");
}

// ---------- Item dialog ----------
function openItem(id) {
  const dlg = $("#itemDlg"), f = $("#itemForm");
  const isNew = !id;
  const it = isNew ? {
    id: "p" + Date.now().toString(36), order: Math.max(0, ...S.items.map((i) => i.order)) + 1, title: "", summary: "",
    theme: $("#fTheme").value || "", stack: "web", reuses: [], status: "approved", effort: "M", notes: "", slug: "",
    links: { live: "", code: "", post: "" }, day: null, shippedAt: null, createdAt: today(),
  } : S.items.find((i) => i.id === id);
  S.editing = { it, isNew };
  f.status.innerHTML = Object.entries(STATUSES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  for (const k of ["title", "summary", "theme", "stack", "effort", "status", "order", "notes"]) f[k].value = it[k] ?? "";
  f.reuses.value = (it.reuses || []).join(", ");
  for (const k of ["live", "code", "post"]) f[k].value = it.links?.[k] || "";
  const ro = !S.canEdit;
  f.querySelectorAll("input, textarea, select").forEach((el) => (el.disabled = ro));
  $("#dlgTitle").textContent = isNew ? "New idea" : `#${it.order} ${it.title}`;
  $("#dlgSave").hidden = ro; $("#deleteBtn").hidden = ro || isNew;
  $("#dlgMeta").textContent = [it.day && `Day ${it.day}`, it.shippedAt && `shipped ${it.shippedAt.slice(0, 10)}`, it.createdAt && `added ${it.createdAt}`, `id ${it.id}`].filter(Boolean).join(" · ");
  dlg.showModal();
}
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }
function submitItem(e) {
  e.preventDefault();
  if (!S.canEdit || !S.editing) return $("#itemDlg").close();
  const f = $("#itemForm"), { it, isNew } = S.editing;
  const next = {
    ...it,
    title: f.title.value.trim(), summary: f.summary.value.trim(), theme: f.theme.value.trim(),
    stack: f.stack.value, effort: f.effort.value, status: f.status.value, notes: f.notes.value.trim(),
    reuses: f.reuses.value.split(",").map((s) => s.trim()).filter(Boolean),
    links: { live: f.live.value.trim(), code: f.code.value.trim(), post: f.post.value.trim() },
  };
  if (!next.slug) next.slug = slugify(next.title);
  const wantOrder = Math.max(1, parseInt(f.order.value, 10) || it.order);
  if (isNew) S.items.push(next); else S.items[S.items.findIndex((i) => i.id === it.id)] = next;
  S.dirty.add(next.id);
  moveTo(next.id, wantOrder);
  $("#itemDlg").close(); saveDraft(); render();
}
function deleteItem() {
  const { it } = S.editing;
  if (it.status === "shipped" && !confirm("This one is already shipped. Delete it from the tracker anyway? (The product itself stays live.)")) return;
  if (!confirm(`Delete “${it.title}”? You can still discard before saving.`)) return;
  S.items = S.items.filter((i) => i.id !== it.id);
  S.dirty.delete(it.id); if (S.base.some((b) => b.id === it.id)) S.deleted.add(it.id);
  renumber(); $("#itemDlg").close(); saveDraft(); render();
}

// ---------- Ordering ----------
function renumber() {
  S.items.sort((a, b) => a.order - b.order).forEach((it, idx) => {
    if (it.order !== idx + 1) { it.order = idx + 1; S.dirty.add(it.id); }
  });
}
function moveTo(id, pos) {
  const arr = S.items.slice().sort((a, b) => a.order - b.order);
  const from = arr.findIndex((i) => i.id === id);
  const [it] = arr.splice(from, 1);
  arr.splice(Math.min(arr.length, pos - 1), 0, it);
  arr.forEach((x, idx) => { if (x.order !== idx + 1) { x.order = idx + 1; S.dirty.add(x.id); } });
}

// ---------- Auth ----------
async function signIn(e) {
  e.preventDefault();
  const token = $("#authForm").token.value.trim(); const err = $("#authErr"); err.hidden = true;
  S.token = token;
  try {
    const me = await gh("/user"); const repo = await gh(`/repos/${REPO}`);
    if (!repo.permissions?.push) throw new Error(`${me.login} doesn't have write access to ${REPO}.`);
    if (!(await tokenCanWrite())) throw new Error(TOKEN_HELP);
    store.set(LS_TOKEN, token); $("#authDlg").close(); $("#authForm").reset();
    toast(`Signed in as ${me.login}.`); await load();
  } catch (ex) {
    S.token = store.get(LS_TOKEN);
    err.textContent = ex.status === 401 ? "GitHub didn't accept that token." : ex.message; err.hidden = false;
  }
}
function signOut() {
  if ((S.dirty.size || S.deleted.size || S.configDirty) && !confirm("You have unsaved changes. They stay in this browser as a draft. Sign out?")) return;
  store.set(LS_TOKEN, null); S.token = null; S.login = null; S.canEdit = false; load();
}

// ---------- Misc ----------
let toastTimer;
function toast(msg, ms = 4000) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms); }
function exportJson() {
  const blob = new Blob([JSON.stringify({ version: 1, items: S.items.slice().sort((a, b) => a.order - b.order) }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "ship100-projects.json" });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function persistView() {
  store.set(LS_VIEW, JSON.stringify({ sort: S.sort, dir: S.dir, q: $("#q").value, th: $("#fTheme").value, st: $("#fStatus").value, sk: $("#fStack").value }));
}
function restoreView() {
  let v; try { v = JSON.parse(store.get(LS_VIEW) || "null"); } catch { v = null; }
  if (!v) return;
  S.sort = v.sort || "order"; S.dir = v.dir || 1; $("#sort").value = S.sort; $("#dir").textContent = S.dir === 1 ? "↓" : "↑"; $("#q").value = v.q || "";
  $("#fTheme").dataset.want = v.th || ""; $("#fStatus").dataset.want = v.st || ""; $("#fStack").dataset.want = v.sk || "";
}

// ---------- Events ----------
$("#list").addEventListener("click", (e) => {
  const row = e.target.closest(".row"); if (!row) return;
  const id = row.dataset.id, act = e.target.closest("[data-act]")?.dataset.act;
  if (act) {
    const it = S.items.find((i) => i.id === id);
    if (act === "approve") it.status = it.status === "approved" ? "idea" : "approved";
    if (act === "skip") it.status = it.status === "skipped" ? "idea" : "skipped";
    return markDirty(id);
  }
  if (e.target.closest("[data-stop]")) return;
  openItem(id);
});
$("#list").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("row")) openItem(e.target.dataset.id); });
$("#list").addEventListener("dragstart", (e) => { const r = e.target.closest(".row"); if (r) { S.dragId = r.dataset.id; e.dataTransfer.effectAllowed = "move"; } });
$("#list").addEventListener("dragover", (e) => { const r = e.target.closest(".row"); if (S.dragId && r) { e.preventDefault(); document.querySelectorAll(".drag-over").forEach((x) => x.classList.remove("drag-over")); r.classList.add("drag-over"); } });
$("#list").addEventListener("drop", (e) => {
  const r = e.target.closest(".row"); if (!S.dragId || !r) return; e.preventDefault();
  const target = S.items.find((i) => i.id === r.dataset.id);
  if (r.dataset.id !== S.dragId) { moveTo(S.dragId, target.order); saveDraft(); }
  S.dragId = null; render();
});
$("#list").addEventListener("dragend", () => { S.dragId = null; document.querySelectorAll(".drag-over").forEach((x) => x.classList.remove("drag-over")); });

for (const id of ["#q", "#fTheme", "#fStatus", "#fStack"]) $(id).addEventListener("input", () => { persistView(); renderList(); });
$("#sort").addEventListener("change", (e) => { S.sort = e.target.value; persistView(); renderList(); });
$("#dir").addEventListener("click", () => { S.dir *= -1; $("#dir").textContent = S.dir === 1 ? "↓" : "↑"; persistView(); renderList(); });
$("#addBtn").addEventListener("click", () => openItem(null));
$("#exportBtn").addEventListener("click", exportJson);
$("#itemForm").addEventListener("submit", submitItem);
$("#deleteBtn").addEventListener("click", deleteItem);
$("#authForm").addEventListener("submit", signIn);
$("#signin").addEventListener("click", () => (S.token ? signOut() : $("#authDlg").showModal()));
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
$("#saveBtn").addEventListener("click", save);
$("#discardBtn").addEventListener("click", discard);
$("#startBtn").addEventListener("click", () => {
  const c = S.config;
  const first = nextUp();
  const msg = !c.started
    ? `Start the 100 days? The first build runs at ${fmtTime(c.dailyTime)} on the next day this Mac is on, starting with “${first ? first.title : "the next idea"}”. Remember to press Save.`
    : "Resume daily builds?";
  if (!confirm(msg)) return;
  if (!c.started) { c.started = true; c.startDate = today(); }
  c.paused = false; S.configDirty = true; saveDraft(); render();
});
$("#pauseBtn").addEventListener("click", () => { S.config.paused = true; S.configDirty = true; saveDraft(); render(); });
window.addEventListener("beforeunload", (e) => { if (S.dirty.size || S.deleted.size || S.configDirty) e.preventDefault(); });

restoreView();
load().catch((e) => { $("#list").innerHTML = `<p class="err">Couldn't load the project list: ${esc(e.message)}</p>`; });
