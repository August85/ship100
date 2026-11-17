// Times Table Race: Day 11 of Ship 100.
// Plain ES module, no build step. Everything stays in this browser.

import { createGame, GAME_SECONDS, bestKey, trackPositions, comboFor } from "./game.js";

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};

// ---------- setup ----------
let selected = new Set(store.get("ttr-tables", [2, 3, 4, 5, 10]));
const chipsEl = $("#tables");
for (let t = 1; t <= 12; t++) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = t;
  b.dataset.t = t;
  b.setAttribute("aria-label", `${t} times table`);
  b.addEventListener("click", () => {
    selected.has(t) ? selected.delete(t) : selected.add(t);
    renderSetup();
  });
  chipsEl.append(b);
}
document.querySelectorAll("[data-preset]").forEach((b) =>
  b.addEventListener("click", () => {
    selected = new Set(b.dataset.preset.split(",").map(Number));
    renderSetup();
  })
);

const soundBox = $("#sound");
soundBox.checked = store.get("ttr-sound", true);
soundBox.addEventListener("change", () => store.set("ttr-sound", soundBox.checked));

function tablesList() { return [...selected].sort((a, b) => a - b); }

function renderSetup() {
  chipsEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", selected.has(+c.dataset.t)));
  const list = tablesList();
  $("#start").disabled = list.length === 0;
  store.set("ttr-tables", list);
  const best = store.get(bestKey(list), null);
  $("#best-line").textContent = !list.length
    ? "Pick at least one table."
    : best
      ? `Best for ${list.join(", ")}: ${best.score} points (${best.correct} right). The grey car drives that run.`
      : `No race yet for ${list.join(", ")}. Set the first record!`;
}
renderSetup();

// ---------- sound (tiny beeps, Web Audio) ----------
let actx = null;
function beep(freq, dur = 0.08, type = "sine", vol = 0.08) {
  if (!soundBox.checked) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch { /* no audio: fine */ }
}

// ---------- keypad ----------
const keypad = $("#keypad");
["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "Go"].forEach((k) => {
  const key = k === "⌫" ? "Backspace" : k === "Go" ? "Enter" : k;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = k;
  if (k === "⌫") b.setAttribute("aria-label", "Delete");
  if (k === "Go") b.className = "go";
  // pointerdown feels instant on phones; click with detail 0 covers keyboard activation.
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); press(key); });
  b.addEventListener("click", (e) => { if (e.detail === 0) press(key); });
  keypad.append(b);
});

// ---------- game ----------
let game = null, typed = "", startAt = 0, pausedAt = 0, timer = 0, locked = false, best = null;

function show(id) {
  for (const s of ["setup", "game", "results"]) $("#" + s).hidden = s !== id;
  // Hide the page title during a race so the whole keypad fits on a phone.
  document.body.classList.toggle("playing", id === "game");
  if (id === "game") window.scrollTo(0, 0);
}

function start() {
  const list = tablesList();
  if (!list.length) return;
  game = createGame(list, { now: () => performance.now() });
  best = store.get(bestKey(list), null);
  typed = ""; locked = false;
  show("game");
  $("#ghost").parentElement.hidden = !best;
  startAt = performance.now();
  pausedAt = 0;
  next();
  updateHud();
  tick();
  beep(660, 0.12, "triangle");
}

function elapsed() { return ((pausedAt || performance.now()) - startAt) / 1000; }

function tick() {
  cancelAnimationFrame(timer);
  const loop = () => {
    if (!game) return;
    const e = elapsed();
    const left = Math.max(0, GAME_SECONDS - e);
    $("#time").textContent = Math.ceil(left);
    const fill = $("#timefill");
    fill.style.transform = `scaleX(${left / GAME_SECONDS})`;
    fill.classList.toggle("low", left <= 10);
    drawTrack(e);
    if (left <= 0) return finish();
    timer = requestAnimationFrame(loop);
  };
  timer = requestAnimationFrame(loop);
}

function drawTrack(e) {
  const pos = trackPositions({ correct: game.state.correct, elapsed: e, bestCorrect: best?.correct || 0 });
  const place = (el, p) => { el.style.left = `calc(${(p * 100).toFixed(2)}% - ${(p * 30).toFixed(1)}px)`; };
  place($("#car"), pos.you);
  if (pos.ghost != null) place($("#ghost"), pos.ghost);
  const pace = $("#pace");
  let msg;
  if (best) {
    const ghostCount = (best.correct * Math.min(e, GAME_SECONDS)) / GAME_SECONDS;
    const diff = game.state.correct - ghostCount;
    msg = diff >= 0.5 ? "Ahead of your best! 🔥" : diff <= -1.5 ? "Catch the grey car!" : "Neck and neck…";
  } else {
    msg = `Reach the flag: ${pos.finish} right answers`;
  }
  if (pace.textContent !== msg) pace.textContent = msg;
}

function next() {
  const q = game.pick();
  typed = "";
  const qEl = $("#question");
  qEl.textContent = `${q.left} × ${q.right}`;
  qEl.setAttribute("aria-label", `${q.left} times ${q.right}`);
  qEl.classList.remove("pop"); void qEl.offsetWidth; qEl.classList.add("pop");
  renderAnswer();
}

function renderAnswer(cls = "", fix = "") {
  const a = $("#answer");
  a.className = "answer " + cls;
  a.textContent = typed || " ";
  if (fix) { const s = document.createElement("span"); s.className = "fix"; s.textContent = fix; a.append(s); }
}

function updateHud() {
  $("#score").textContent = game.state.score;
  const c = comboFor(game.state.streak);
  const comboEl = $("#combo");
  comboEl.textContent = "×" + c;
  comboEl.classList.toggle("hot", c > 1);
}

function press(key) {
  if (!game || $("#game").hidden || locked || pausedAt) return;
  const q = game.state.current;
  if (!q) return;
  if (/^[0-9]$/.test(key)) {
    if (typed.length >= 3) return;
    typed += key;
    renderAnswer();
    if (typed.length >= String(q.answer).length) submit();
  } else if (key === "Backspace") {
    typed = typed.slice(0, -1);
    renderAnswer();
  } else if (key === "Enter" && typed) {
    submit();
  }
}

function submit() {
  const res = game.answer(typed);
  updateHud();
  locked = true;
  if (res.ok) {
    renderAnswer("ok");
    beep(520 + 120 * res.combo, 0.07, "triangle");
  } else {
    renderAnswer("bad", `= ${res.answer}`);
    beep(150, 0.18, "sawtooth", 0.05);
  }
  setTimeout(() => { locked = false; if (game) next(); }, res.ok ? 160 : 1100);
}

function finish() {
  cancelAnimationFrame(timer);
  if (!game) return;
  const s = game.summary();
  const list = game.state.tables;
  const prev = store.get(bestKey(list), null);
  const record = s.correct > 0 && (!prev || s.score > prev.score);
  if (record) store.set(bestKey(list), { score: s.score, correct: s.correct, at: new Date().toISOString().slice(0, 10) });
  game = null;

  $("#result-title").innerHTML = record
    ? (prev ? `<span class="record">New record! 🏆</span>` : `<span class="record">First record set! 🏁</span>`)
    : "Race over!";
  const stats = [
    [s.score, "points"],
    [s.correct, "right"],
    [`${s.accuracy}%`, "accuracy"],
    [s.bestStreak, "best streak"],
    [s.avgSeconds != null ? `${s.avgSeconds}s` : "–", "per answer"],
  ];
  if (prev && !record) stats.push([prev.score, "your best"]);
  $("#stats").replaceChildren(...stats.map(([v, l]) => {
    const d = document.createElement("div");
    d.className = "stat";
    const b = document.createElement("b"); b.textContent = v;
    const sp = document.createElement("span"); sp.textContent = l;
    d.append(b, sp);
    return d;
  }));

  $("#missed-wrap").hidden = !s.missed.length;
  $("#missed").replaceChildren(...s.missed.map((m) => {
    const li = document.createElement("li");
    li.textContent = `${m.a} × ${m.b} = ${m.a * m.b}`;
    if (m.times > 1) { const sm = document.createElement("small"); sm.textContent = ` (missed ${m.times}×)`; li.append(sm); }
    return li;
  }));

  show("results");
  if (record) { beep(660, 0.1, "triangle"); setTimeout(() => beep(880, 0.1, "triangle"), 110); setTimeout(() => beep(1320, 0.2, "triangle"), 220); }
  else beep(440, 0.15, "triangle");
  $("#again").focus();
  renderSetup();
}

// Pause the clock if the tab is hidden, so a switched-away race isn't lost.
document.addEventListener("visibilitychange", () => {
  if (!game) return;
  if (document.hidden) { pausedAt = performance.now(); cancelAnimationFrame(timer); }
  else if (pausedAt) { startAt += performance.now() - pausedAt; pausedAt = 0; tick(); }
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || !game) return;
  if (/^[0-9]$/.test(e.key) || e.key === "Backspace" || e.key === "Enter") {
    e.preventDefault();
    press(e.key);
  } else if (e.key === "Escape") finish();
});

$("#start").addEventListener("click", start);
$("#again").addEventListener("click", start);
$("#change").addEventListener("click", () => { show("setup"); $("#start").focus(); });
$("#quit").addEventListener("click", finish);
