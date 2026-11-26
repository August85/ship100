// Story Dice: Day 20 of Ship 100.
// Plain ES module, no build step. Read-aloud uses the browser's own Web Speech API; no keys, no server.
import { DICE, roll, buildStory, storyTitle } from "./engine.js";

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem("sd." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("sd." + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const dieEls = [...document.querySelectorAll(".die")];
let faces = null;           // current face index per die
const locked = [false, false, false];
let story = null, rolling = false;

// ---------- settings ----------
const opts = { auto: store.get("auto", true), rate: store.get("rate", 0.9) };
$("#auto").checked = opts.auto;
$("#rate").value = opts.rate;
$("#auto").addEventListener("change", (e) => { opts.auto = e.target.checked; store.set("auto", opts.auto); });
$("#rate").addEventListener("change", (e) => { opts.rate = Number(e.target.value); store.set("rate", opts.rate); });

// ---------- speech ----------
const synth = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window ? window.speechSynthesis : null;
let voice = null;
function pickVoice() {
  if (!synth) return;
  const en = synth.getVoices().filter((v) => /^en/i.test(v.lang));
  voice = en.find((v) => v.localService && /samantha|karen|moira|serena|daniel|female/i.test(v.name))
    || en.find((v) => v.localService) || en[0] || null;
}
if (synth) { pickVoice(); synth.addEventListener?.("voiceschanged", pickVoice); }
else $("#voiceNote").textContent = "This browser can't read aloud, so read the story yourself.";

function speak(text) {
  if (!synth) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
    u.rate = opts.rate; u.pitch = 1.1;
    u.onend = u.onerror = () => setReading(false);
    synth.speak(u); setReading(true);
  } catch { setReading(false); }
}
function stop() { try { synth?.cancel(); } catch { /* ignore */ } setReading(false); }
function setReading(on) {
  $("#read").textContent = on ? "⏹ Stop reading" : "🔊 Read it to me";
  $("#read").setAttribute("aria-pressed", String(on));
}
$("#read").addEventListener("click", () => {
  if (!story) return;
  if (synth?.speaking) stop(); else speak(story.speech);
});

// ---------- dice ----------
function paint(i, idx) {
  const f = DICE[i].faces[idx], el = dieEls[i];
  el.querySelector(".face").textContent = f.e;
  el.querySelector(".name").textContent = f.label;
}
function updateLabel(i) {
  const el = dieEls[i], d = DICE[i];
  const what = faces ? d.faces[faces[i]].label : "not rolled yet";
  el.setAttribute("aria-label", `${d.name}: ${what}${locked[i] ? ", kept" : ""}`);
}

dieEls.forEach((el, i) => {
  updateLabel(i);
  el.addEventListener("click", () => {
    if (!faces || rolling) return;   // nothing to keep before the first roll
    locked[i] = !locked[i];
    el.setAttribute("aria-pressed", String(locked[i]));
    updateLabel(i);
    $("#hint").textContent = locked.every(Boolean)
      ? "All three are kept. Tap one to let it roll."
      : "Tap a die to keep it. Roll changes the rest.";
  });
});

async function doRoll() {
  if (rolling) return;
  if (faces && locked.every(Boolean)) { $("#hint").textContent = "All three are kept. Tap one to let it roll."; return; }
  rolling = true; stop();
  $("#roll").disabled = true;
  const next = roll(faces, locked);
  if (!reduceMotion) {
    dieEls.forEach((el, i) => { if (!(faces && locked[i])) { el.classList.remove("landed"); el.classList.add("rolling"); } });
    // Flicker through random faces, stopping one die at a time from left to right.
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => {
        const t = performance.now() - t0;
        dieEls.forEach((el, i) => {
          if (!el.classList.contains("rolling")) return;
          if (t > 450 + i * 250) { el.classList.remove("rolling"); el.classList.add("landed"); paint(i, next[i]); }
          else el.querySelector(".face").textContent = DICE[i].faces[Math.floor(Math.random() * DICE[i].faces.length)].e;
        });
        if (dieEls.some((el) => el.classList.contains("rolling"))) setTimeout(tick, 70); else done();
      };
      tick();
    });
  }
  faces = next;
  faces.forEach((idx, i) => { paint(i, idx); updateLabel(i); });
  showStory();
  rolling = false;
  $("#roll").disabled = false;
  $("#roll").textContent = "🎲 Roll again";
  $("#read").disabled = !synth;
  if (opts.auto) speak(story.speech);
}
$("#roll").addEventListener("click", doRoll);

// ---------- story card ----------
// Splits `text` around `word` and wraps the word in a <mark> coloured like die i.
function mark(text, word, i) {
  const at = text.indexOf(word);
  if (at < 0) return [document.createTextNode(text)];
  const m = document.createElement("mark");
  m.style.setProperty("--c", `var(--${DICE[i].key})`);
  m.textContent = word;
  return [document.createTextNode(text.slice(0, at)), m, document.createTextNode(text.slice(at + word.length))];
}
function showStory() {
  story = buildStory(faces, Math.random());
  $("#title").textContent = `${story.hero.e} ${storyTitle(faces)}`;
  const opening = mark(story.opening, story.hero.full, 0);
  const rest = opening.pop();
  $("#opening").replaceChildren(...opening, ...mark(rest.textContent, story.place.where, 1));
  $("#twist").replaceChildren(...mark(story.twist, story.problem.what, 2));
  $("#questions").replaceChildren(...story.questions.map((q) => Object.assign(document.createElement("li"), { textContent: q })));
  $("#ending").textContent = story.ending;
  $("#story").hidden = false;
}

// Press R anywhere (outside a form field) to roll, for a quick keyboard turn.
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) doRoll();
});
