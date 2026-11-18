// Spelling Bee Coach: Day 12 of Ship 100.
// Plain ES module, no build step. Speech uses the browser's own Web Speech API; no keys, no server.

import { LEVELS } from "./words.js";
import {
  applySteps, bestAlternative, compare, MAX_TRIES, parseCustomList, pickRound, spellOut, starsFor, summarize,
} from "./speller.js";

const $ = (s) => document.querySelector(s);
const ROUND = 10;
const CUSTOM_MAX = 20;

// ---------- storage (best effort) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("sbc:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("sbc:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- speech out ----------
const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
let voice = null;
function pickVoice() {
  if (!synth) return;
  const vs = synth.getVoices();
  const en = vs.filter((v) => /^en[-_]/i.test(v.lang));
  const pref = navigator.language && /^en/i.test(navigator.language) ? navigator.language.toLowerCase() : "en-us";
  voice = en.find((v) => v.lang.toLowerCase().replace("_", "-") === pref && v.localService)
    || en.find((v) => v.lang.toLowerCase().replace("_", "-") === pref)
    || en.find((v) => v.localService) || en[0] || null;
}
if (synth) { pickVoice(); synth.addEventListener?.("voiceschanged", pickVoice); }

function say(text, rate = 0.9) {
  if (!synth) return;
  stopListening();
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
  u.rate = rate;
  u.pitch = 1.05;
  synth.speak(u);
}

// ---------- speech in ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let rec = null;
let silenceTimer = 0;

// ---------- state ----------
const state = {
  levelId: store.get("level", "bee"),
  words: [],       // [{word, sentence}]
  i: 0,
  letters: [],
  tries: 0,
  hints: 0,
  done: false,     // current word finished
  doneAt: 0,
  results: [],
  custom: false,
};
const opts = { boxes: store.get("boxes", true), voice: store.get("voice", true) };

// ---------- setup screen ----------
function renderLevels() {
  const box = $("#levels");
  box.innerHTML = "";
  for (const lvl of LEVELS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "level";
    b.dataset.level = lvl.id;
    const missed = store.get("missed:" + lvl.id, []).length;
    b.innerHTML = `<span class="lv-name">${lvl.name}</span><span class="lv-blurb">${lvl.blurb}</span>` +
      (missed ? `<span class="lv-missed">${missed} to practise</span>` : "");
    b.addEventListener("click", () => startLevel(lvl.id));
    box.append(b);
  }
}

function startLevel(id, onlyWords) {
  const lvl = LEVELS.find((l) => l.id === id) || LEVELS[0];
  state.levelId = lvl.id;
  state.custom = false;
  store.set("level", lvl.id);
  const missed = store.get("missed:" + lvl.id, []);
  const pool = onlyWords ? lvl.words.filter((w) => onlyWords.includes(w.word)) : lvl.words;
  startRound(pickRound(pool, ROUND, missed));
}

function startCustom(onlyWords) {
  const list = onlyWords || parseCustomList($("#customText").value);
  if (!list.length) { $("#customInfo").textContent = "Add at least one word (letters only)."; return; }
  state.custom = true;
  state.levelId = "custom";
  startRound(pickRound(list.slice(0, CUSTOM_MAX).map((word) => ({ word, sentence: "" })), CUSTOM_MAX));
}

function showScreen(name) {
  for (const id of ["setup", "play", "results"]) $("#" + id).hidden = id !== name;
}

// ---------- play ----------
function startRound(words) {
  state.words = words;
  state.i = 0;
  state.results = [];
  showScreen("play");
  $("#micRow").hidden = !(SR && opts.voice);
  $("#saySentence").hidden = state.custom;
  $("#peekRow").hidden = !!synth;
  loadWord();
  $("#sayWord").focus();
}

function current() { return state.words[state.i]; }

function loadWord() {
  state.letters = [];
  state.tries = 0;
  state.hints = 0;
  state.done = false;
  $("#feedback").textContent = "";
  $("#feedback").className = "feedback";
  $("#heard").textContent = "";
  $("#peekWord").hidden = true;
  const hadFocus = document.activeElement === $("#nextBtn");
  $("#checkBtn").hidden = false;
  $("#nextBtn").hidden = true;
  setPlayEnabled(true);
  if (hadFocus) $("#sayWord").focus();
  renderProgress();
  renderTiles();
  setTimeout(() => say(current().word, 0.85), 250);
}

function setPlayEnabled(on) {
  for (const id of ["#hint", "#mic", "#checkBtn"]) $(id).disabled = !on;
  for (const b of $("#keys").querySelectorAll("button")) b.disabled = !on;
}

function renderProgress() {
  $("#progress").textContent = `Word ${state.i + 1} of ${state.words.length}`;
  const comb = $("#comb");
  comb.innerHTML = "";
  state.words.forEach((_, k) => {
    const c = document.createElement("span");
    const r = state.results[k];
    c.className = "cell" + (k === state.i && !r ? " now" : "") + (r ? (r.correct ? " got s" + r.stars : " miss") : "");
    comb.append(c);
  });
}

function renderTiles(marks) {
  const box = $("#tiles");
  box.innerHTML = "";
  const target = current().word;
  box.style.setProperty("--n", Math.max(3, marks ? marks.length : opts.boxes ? Math.max(target.length, state.letters.length) : state.letters.length));
  if (marks) {
    // After a miss: show the right spelling, green where the child had the letter, orange where they didn't.
    for (const m of marks) {
      const t = document.createElement("span");
      t.className = "tile " + (m.ok ? "ok" : "fix");
      t.textContent = m.letter;
      box.append(t);
    }
    box.setAttribute("aria-label", "The right spelling: " + target.split("").join(" "));
    return;
  }
  const slots = opts.boxes ? Math.max(target.length, state.letters.length) : state.letters.length;
  for (let k = 0; k < Math.max(slots, 1); k++) {
    const t = document.createElement("span");
    const ch = state.letters[k];
    t.className = "tile" + (ch ? " filled" : " empty") + (k === state.letters.length ? " cursor" : "");
    t.textContent = ch || "";
    box.append(t);
  }
  box.setAttribute("aria-label", state.letters.length ? "Your spelling: " + state.letters.join(" ") : "No letters yet");
}

function addLetter(ch) {
  if (state.done) return;
  if (state.letters.length >= 20) return;
  state.letters.push(ch);
  renderTiles();
}
function backspace() { if (!state.done) { state.letters.pop(); renderTiles(); } }

function feedback(text, kind = "") {
  const f = $("#feedback");
  f.textContent = text;
  f.className = "feedback " + kind;
}

const PRAISE = ["Yes!", "Brilliant!", "You got it!", "Super speller!", "Buzz-tastic!", "Perfect!"];

function check() {
  if (state.done) return;
  stopListening();
  const w = current().word;
  const attempt = state.letters.join("");
  if (!attempt) { feedback("Spell the word first: say the letters or tap them."); return; }
  state.tries++;
  if (attempt === w) {
    const stars = starsFor({ correct: true, tries: state.tries, hints: state.hints });
    finishWord(true, stars, attempt);
    const p = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    feedback(`${p} ${"⭐".repeat(stars)}`, "good");
    say(`${p} ${w}.`);
    return;
  }
  if (state.tries < MAX_TRIES) {
    feedback("Not quite. Listen again and have another go.", "warn");
    say(`Not quite. Try again. ${w}.`);
    return;
  }
  finishWord(false, 0, attempt);
  renderTiles(compare(w, attempt).letters);
  feedback(`It's spelled ${w.toUpperCase().split("").join("-")}. You tried “${attempt}”. It'll come back next time.`, "bad");
  say(`The word is ${w}. ${spellOut(w)}`, 0.8);
}

function finishWord(correct, stars, attempt) {
  state.done = true;
  state.doneAt = performance.now();
  state.results[state.i] = { word: current().word, correct, stars, tries: state.tries, hints: state.hints, attempt };
  rememberMissed(current().word, !correct);
  setPlayEnabled(false);
  $("#checkBtn").hidden = true;
  $("#nextBtn").hidden = false;
  $("#nextBtn").textContent = state.i + 1 < state.words.length ? "Next word →" : "See my stars →";
  $("#nextBtn").focus();
  renderProgress();
}

function rememberMissed(word, missed) {
  if (state.custom) return;
  const key = "missed:" + state.levelId;
  const set = new Set(store.get(key, []));
  if (missed) set.add(word); else set.delete(word);
  store.set(key, [...set]);
}

function next() {
  // Ignore the same Enter/tap that just finished the word (and kids hammering the key) for a moment.
  if (!state.done || performance.now() - state.doneAt < 400) return;
  if (state.i + 1 < state.words.length) { state.i++; loadWord(); }
  else showResults();
}

function hint() {
  if (state.done) return;
  const w = current().word;
  if (state.hints >= w.length - 1) { feedback("No more hints for this one. You can do it!"); return; }
  state.hints++;
  state.letters = w.slice(0, state.hints).split("");
  renderTiles();
  feedback(`It starts with ${w.slice(0, state.hints).toUpperCase().split("").join("-")}…`);
  say(`It starts with ${spellOut(w.slice(0, state.hints))}`, 0.85);
}

// ---------- microphone ----------
function startListening() {
  if (!SR || state.done) return;
  if (rec) { stopListening(); return; }
  synth?.cancel();
  const base = state.letters.slice();
  const lang = navigator.language && /^en/i.test(navigator.language) ? navigator.language : "en-US";
  rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  $("#mic").classList.add("on");
  $("#mic").textContent = "■ Stop listening";
  $("#heard").textContent = "Listening… say each letter, like “see, ay, tea”.";

  rec.onresult = (e) => {
    let letters = base;
    let wantsCheck = false;
    const heard = [];
    const unknown = [];
    for (let k = 0; k < e.results.length; k++) {
      const res = e.results[k];
      const alts = Array.from({ length: res.length }, (_, a) => res[a].transcript);
      const best = bestAlternative(alts);
      heard.push(best.transcript.trim());
      unknown.push(...best.parsed.unknown);
      const r = applySteps(letters, best.parsed.steps);
      letters = r.letters;
      if (r.check && res.isFinal) wantsCheck = true;
    }
    state.letters = letters;
    renderTiles();
    $("#heard").textContent = "Heard: “" + heard.join(" ") + "”";
    if (unknown.includes(current().word)) feedback("Say each letter on its own, like “see, ay, tea”.");
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stopListening, 3500);
    if (wantsCheck) check();
  };
  rec.onerror = (e) => {
    const msg = {
      "not-allowed": "The microphone is blocked. Tap the letters instead, or allow the mic in your browser settings.",
      "service-not-allowed": "Speech isn't available here. Tap the letters instead.",
      "no-speech": "I didn't hear anything. Tap 🎤 and try again.",
      "network": "Speech needs an internet connection in this browser. Tap the letters instead.",
    }[e.error];
    if (msg) $("#heard").textContent = msg;
  };
  rec.onend = () => {
    rec = null;
    clearTimeout(silenceTimer);
    $("#mic").classList.remove("on");
    $("#mic").textContent = "🎤 Spell it out loud";
  };
  try { rec.start(); silenceTimer = setTimeout(stopListening, 6000); }
  catch { rec = null; $("#heard").textContent = "Couldn't start the microphone. Tap the letters instead."; }
}

function stopListening() {
  clearTimeout(silenceTimer);
  if (rec) { try { rec.stop(); } catch { /* already stopped */ } }
}

// ---------- results ----------
function showResults() {
  stopListening();
  synth?.cancel();
  const done = state.results.filter(Boolean);
  if (!done.length) { goHome(); return; }
  const s = summarize(done);
  showScreen("results");
  const ratio = s.stars / s.maxStars;
  $("#resTitle").textContent = ratio >= 0.9 ? "Spelling champion! 🏆" : ratio >= 0.6 ? "Great spelling! 🐝" : "Good practice! 🌼";
  $("#resStars").textContent = `${s.stars} of ${s.maxStars} ⭐`;
  $("#resStats").innerHTML = "";
  for (const [n, label] of [[`${s.correct}/${s.total}`, "spelled right"], [s.firstTry, "first try, no hints"], [s.missed.length, "to practise"]]) {
    const d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = `<b>${n}</b><span>${label}</span>`;
    $("#resStats").append(d);
  }
  const ul = $("#resList");
  ul.innerHTML = "";
  for (const r of done) {
    const li = document.createElement("li");
    li.className = r.correct ? "ok" : "miss";
    const word = document.createElement("span");
    word.className = "w";
    word.textContent = r.word;
    const note = document.createElement("span");
    note.className = "muted small";
    note.textContent = r.correct ? "⭐".repeat(r.stars) : `you tried “${r.attempt}”`;
    const hear = document.createElement("button");
    hear.type = "button";
    hear.className = "mini";
    hear.textContent = "🔊";
    hear.setAttribute("aria-label", "Hear " + r.word);
    hear.addEventListener("click", () => say(`${r.word}. ${spellOut(r.word)}`, 0.8));
    li.append(word, note, hear);
    ul.append(li);
  }
  $("#practise").hidden = !s.missed.length;
  $("#practise").onclick = () => (state.custom ? startCustom(s.missed) : startLevel(state.levelId, s.missed));
  $("#again").focus();
  say(`${$("#resTitle").textContent.replace(/[^\w\s!]/gu, "")} You got ${s.stars} stars.`);
}

function goHome() {
  stopListening();
  synth?.cancel();
  renderLevels();
  showScreen("setup");
}

// ---------- letter keyboard ----------
function buildKeys() {
  const box = $("#keys");
  for (const ch of "abcdefghijklmnopqrstuvwxyz") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "key";
    b.textContent = ch;
    b.setAttribute("aria-label", ch.toUpperCase());
    b.addEventListener("click", () => addLetter(ch));
    box.append(b);
  }
  const del = document.createElement("button");
  del.type = "button";
  del.className = "key del";
  del.textContent = "⌫";
  del.setAttribute("aria-label", "Delete last letter");
  del.addEventListener("click", backspace);
  box.append(del);
}

// ---------- wiring ----------
$("#sayWord").addEventListener("click", () => say(current().word, 0.85));
$("#saySentence").addEventListener("click", () => current().sentence && say(`${current().word}. ${current().sentence} ${current().word}.`));
$("#saySlow").addEventListener("click", () => say(current().word, 0.5));
$("#hint").addEventListener("click", hint);
$("#mic").addEventListener("click", startListening);
$("#checkBtn").addEventListener("click", check);
$("#nextBtn").addEventListener("click", next);
$("#quit").addEventListener("click", showResults);
$("#again").addEventListener("click", () => (state.custom ? startCustom() : startLevel(state.levelId)));
$("#home").addEventListener("click", goHome);
$("#customGo").addEventListener("click", () => startCustom());
$("#peek").addEventListener("click", () => { $("#peekWord").textContent = current().word; $("#peekWord").hidden = false; });

const customText = $("#customText");
customText.value = store.get("custom", "");
const updateCustomInfo = () => {
  const n = parseCustomList(customText.value).length;
  $("#customInfo").textContent = n ? `${n} word${n === 1 ? "" : "s"}${n > CUSTOM_MAX ? ` (first ${CUSTOM_MAX} used)` : ""}` : "";
};
customText.addEventListener("input", () => { store.set("custom", customText.value); updateCustomInfo(); });
updateCustomInfo();
if (customText.value.trim()) $("#customBox").open = true;

$("#optBoxes").checked = opts.boxes;
$("#optVoice").checked = opts.voice;
$("#optBoxes").addEventListener("change", (e) => { opts.boxes = e.target.checked; store.set("boxes", opts.boxes); });
$("#optVoice").addEventListener("change", (e) => { opts.voice = e.target.checked; store.set("voice", opts.voice); });
if (!SR) {
  $("#optVoice").checked = false;
  $("#optVoice").disabled = true;
}
$("#support").textContent = [
  synth ? "" : "This browser can't speak words out loud, so a grown-up will need to read them.",
  SR ? "Tip: say letter names one at a time (“bee, ee, dee”). Say “oops” to undo a letter, “done” to check." :
    "This browser can't listen for spelling (try Chrome, Edge or Safari). Tapping or typing the letters works everywhere.",
].filter(Boolean).join(" ");

document.addEventListener("keydown", (e) => {
  if ($("#play").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") return;
  const k = e.key;
  if (/^[a-z]$/i.test(k)) { addLetter(k.toLowerCase()); e.preventDefault(); }
  else if (k === "Backspace") { backspace(); e.preventDefault(); }
  else if (k === "Enter") {
    // Enter means "check" / "next", except on the smaller helper buttons, which keep their own Enter.
    const el = document.activeElement;
    if (el?.closest(".hear-more, #micRow, #quit, #peekRow")) return;
    state.done ? next() : check();
    e.preventDefault();
  } else if (k === " ") {
    if (document.activeElement?.tagName === "BUTTON") return;
    say(current().word, 0.85); e.preventDefault();
  } else if (k === "Escape") { showResults(); }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) { stopListening(); synth?.cancel(); } });

buildKeys();
renderLevels();
