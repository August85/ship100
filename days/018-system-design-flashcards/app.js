// System Design Flashcards: Day 18 of Ship 100.
// Plain ES module, no build step. Progress lives in localStorage only.
import { schedule, buildQueue, counts, requeue, streak, forecast, dayNumber, previewLabel, isNew, GRADES } from "./engine.js";

const KEY = "ship100.sdf.v1";
const $ = (s) => document.querySelector(s);
const today = () => dayNumber(new Date());

let data = null;          // cards.json
let allCards = [];        // flattened, each with deckId
let deckById = new Map();
let store = load();
let session = null;       // { queue, done, total, current, revealed }

function load() {
  const base = { state: {}, decks: null, newPerDay: 20, log: {} };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...base, ...JSON.parse(raw) } : base;
  } catch { return base; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode: progress lasts this visit */ }
}
function dayLog(d = today()) {
  return (store.log[d] ||= { reviews: 0, fresh: 0, extra: 0 });
}
const selectedDecks = () => new Set(store.decks ?? data.decks.map((d) => d.id));
const activeCards = () => { const sel = selectedDecks(); return allCards.filter((c) => sel.has(c.deckId)); };
const newLeft = () => { const l = store.log[today()] || { fresh: 0, extra: 0 }; return Math.max(0, store.newPerDay + (l.extra || 0) - (l.fresh || 0)); };

async function init() {
  try {
    const res = await fetch("cards.json");
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    $("#startTitle").textContent = "Couldn't load the cards. Reload to try again.";
    return;
  }
  for (const d of data.decks) {
    deckById.set(d.id, d);
    for (const c of d.cards) allCards.push({ ...c, deckId: d.id });
  }
  $("#newPerDay").value = String(store.newPerDay);
  renderHome();
}

/* ---------- Home ---------- */
function renderHome() {
  const t = today();
  const cards = activeCards();
  const c = counts(cards, store.state, t);
  const reviewedDays = Object.keys(store.log).filter((d) => store.log[d].reviews > 0).map(Number);
  const nl = Math.min(newLeft(), c.fresh);
  $("#stats").innerHTML = [
    [c.due, "due now"], [nl, "new today"], [`${c.learned}<small class="muted">/${c.total}</small>`, "learned"], [streak(reviewedDays, t), "day streak"],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

  const n = c.due + nl;
  const btn = $("#startBtn");
  btn.disabled = n === 0;
  btn.textContent = n ? `Study ${n}` : "All done";
  $("#startTitle").textContent = n
    ? `${c.due} review${c.due === 1 ? "" : "s"} and ${nl} new card${nl === 1 ? "" : "s"}`
    : c.total ? "Nothing due. Come back tomorrow." : "Pick at least one deck below.";
  const todayLog = store.log[t];
  $("#startSub").textContent = todayLog?.reviews ? `${todayLog.reviews} answered today.` : "Takes about 5–10 minutes.";

  const fc = forecast(cards, store.state, t, 7);
  const max = Math.max(1, ...fc);
  const names = ["Today", "Tmrw"];
  $("#forecast").setAttribute("aria-label", "Reviews due over the next 7 days: " + fc.join(", "));
  $("#forecast").innerHTML = fc.map((v, i) => {
    const label = names[i] ?? new Date(Date.now() + i * 864e5).toLocaleDateString(undefined, { weekday: "short" });
    return `<div class="fc"><i class="${v ? "" : "zero"}" style="height:${Math.round((v / max) * 60)}px"></i><b>${v}</b><span>${label}</span></div>`;
  }).join("");

  renderDecks();
}

function renderDecks() {
  const t = today();
  const sel = selectedDecks();
  const groups = new Map();
  for (const d of data.decks) {
    if (!groups.has(d.group)) groups.set(d.group, []);
    groups.get(d.group).push(d);
  }
  const openGroups = new Set([...document.querySelectorAll("#decks details[open]")].map((e) => e.dataset.group));
  const first = !document.querySelector("#decks details");
  $("#decks").innerHTML = [...groups].map(([g, decks]) => {
    const on = decks.filter((d) => sel.has(d.id)).length;
    const total = decks.reduce((n, d) => n + d.cards.length, 0);
    const open = first ? g === "Interview practice" : openGroups.has(g);
    return `<details class="card group" data-group="${g}" ${open ? "open" : ""}>
      <summary><span class="group-name">${g}</span><span class="muted small">${on}/${decks.length} decks · ${total} cards</span>
        <button class="group-all" data-group-toggle="${g}" aria-label="${on === decks.length ? "Turn off" : "Turn on"} all ${g} decks">${on === decks.length ? "None" : "All"}</button></summary>
      <div class="deck-list">${decks.map((d) => {
        const c = counts(d.cards, store.state, t);
        return `<label class="deck"><input type="checkbox" data-deck="${d.id}" ${sel.has(d.id) ? "checked" : ""}>
          <span class="name">${d.title}</span>
          <span class="meta">${c.due ? `<span class="due">${c.due} due</span> · ` : ""}${c.learned}/${c.total}</span></label>`;
      }).join("")}</div></details>`;
  }).join("");
  $("#deckCount").textContent = `${sel.size} of ${data.decks.length} on`;
}

$("#decks").addEventListener("change", (e) => {
  const id = e.target.dataset?.deck;
  if (!id) return;
  const sel = selectedDecks();
  e.target.checked ? sel.add(id) : sel.delete(id);
  store.decks = [...sel];
  save();
  renderHome();
});
$("#decks").addEventListener("click", (e) => {
  const g = e.target.dataset?.groupToggle;
  if (!g) return;
  e.preventDefault();
  const sel = selectedDecks();
  const ids = data.decks.filter((d) => d.group === g).map((d) => d.id);
  const allOn = ids.every((id) => sel.has(id));
  ids.forEach((id) => (allOn ? sel.delete(id) : sel.add(id)));
  store.decks = [...sel];
  save();
  renderHome();
});

/* ---------- Study ---------- */
function show(id) {
  for (const s of ["home", "study", "done"]) $("#" + s).hidden = s !== id;
}

function startSession() {
  const queue = buildQueue(activeCards(), store.state, today(), newLeft());
  if (!queue.length) return;
  session = { queue, answered: 0, total: queue.length, revealed: false };
  show("study");
  nextCard();
}

function nextCard() {
  if (!session.queue.length) return finish();
  const card = session.queue[0];
  const s = store.state[card.id];
  session.revealed = false;
  const deck = deckById.get(card.deckId);
  $("#cardDeck").textContent = `${deck.group} · ${deck.title}`;
  const tag = $("#cardTag");
  const relearning = s && !isNew(s) && s.ivl === 0;
  tag.textContent = isNew(s) ? "New" : relearning ? "Relearn" : `Review · ${s.ivl}d`;
  tag.className = "tag " + (isNew(s) ? "new" : relearning ? "lapse" : "");
  $("#cardQ").textContent = card.q;
  $("#cardA").innerHTML = card.a; // bundled, sanitized at build time (scripts/build-cards.mjs)
  $("#cardA").hidden = true;
  $("#grades").hidden = true;
  $("#showBtn").hidden = false;
  $("#showBtn").focus({ preventScroll: true });
  const pct = Math.round((session.answered / (session.answered + session.queue.length)) * 100);
  $("#progressBar").style.width = pct + "%";
  $("#progressText").textContent = `${session.queue.length} left`;
}

function reveal() {
  if (!session || session.revealed) return;
  session.revealed = true;
  const card = session.queue[0];
  const s = store.state[card.id];
  for (const b of document.querySelectorAll("#grades .g")) {
    b.querySelector("span").textContent = previewLabel(s, Number(b.dataset.grade), today());
  }
  $("#cardA").hidden = false;
  $("#showBtn").hidden = true;
  $("#grades").hidden = false;
  document.querySelector("#grades .good").focus({ preventScroll: true });
}

function grade(g) {
  if (!session?.revealed) return;
  const t = today();
  const card = session.queue.shift();
  const prev = store.state[card.id];
  const log = dayLog(t);
  if (isNew(prev)) log.fresh++; // counts against today's new limit once
  log.reviews++;
  store.state[card.id] = schedule(prev, g, t);
  save();
  session.answered++;
  if (g === GRADES.again) session.queue = requeue(session.queue, card);
  nextCard();
}

function finish() {
  session = null;
  const l = store.log[today()] || { reviews: 0 };
  const c = counts(activeCards(), store.state, today());
  $("#doneText").textContent = `${l.reviews} answer${l.reviews === 1 ? "" : "s"} today. ${c.learned} of ${c.total} cards learned. Next reviews come due tomorrow.`;
  $("#moreBtn").hidden = c.fresh === 0;
  show("done");
  $("#homeBtn").focus();
}

$("#startBtn").addEventListener("click", startSession);
$("#showBtn").addEventListener("click", reveal);
$("#flash").addEventListener("click", reveal);
$("#grades").addEventListener("click", (e) => {
  const b = e.target.closest("[data-grade]");
  if (b) grade(Number(b.dataset.grade));
});
$("#quitBtn").addEventListener("click", () => { session = null; show("home"); renderHome(); });
$("#homeBtn").addEventListener("click", () => { show("home"); renderHome(); });
$("#moreBtn").addEventListener("click", () => {
  const l = dayLog();
  l.extra = Math.max(l.extra || 0, (l.fresh || 0) - store.newPerDay) + 10;
  save();
  startSession();
});

document.addEventListener("keydown", (e) => {
  if (!session || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!session.revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); reveal(); }
  else if (session.revealed && "1234".includes(e.key)) { e.preventDefault(); grade(Number(e.key)); }
  else if (session.revealed && e.key === " ") { e.preventDefault(); grade(GRADES.good); }
  else if (e.key === "Escape") $("#quitBtn").click();
});

/* ---------- Settings ---------- */
$("#newPerDay").addEventListener("change", (e) => {
  store.newPerDay = Number(e.target.value) || 20;
  save();
  renderHome();
});
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "ship100-system-design-flashcards", ...store }, null, 1)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `flashcards-progress-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#importInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (typeof j.state !== "object" || j.state === null) throw new Error("no state");
    store = { state: j.state, decks: Array.isArray(j.decks) ? j.decks : null, newPerDay: Number(j.newPerDay) || 20, log: j.log || {} };
    save();
    $("#newPerDay").value = String(store.newPerDay);
    renderHome();
    alert("Progress imported.");
  } catch {
    alert("That file doesn't look like an export from this app.");
  }
  e.target.value = "";
});
$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Forget all progress in this browser? This can't be undone.")) return;
  store = { state: {}, decks: store.decks, newPerDay: store.newPerDay, log: {} };
  save();
  renderHome();
});

init();
