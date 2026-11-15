// Star Chart for Kids: Day 9 of Ship 100.
// Plain ES module, no build step. State lives in localStorage on this device only.
import {
  CHORES, REWARDS, THEMES, MAX_CHORES, defaultState, sanitize, weekDays, weekLabel, isoDate,
  countStars, maxStars, clampGoal, toggleStar, nextWeek, newId, key,
} from "./chart.js";

const STORE = "ship100-star-chart";
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};

const STAR_PATH = "M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z";
const star = (cls) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", STAR_PATH);
  p.setAttribute("stroke-linejoin", "round");
  s.append(p);
  return s;
};

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? sanitize(JSON.parse(raw)) : defaultState();
  } catch { return defaultState(); }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* private mode: still works for this visit */ }
}

let state = load();
let focusCell = { r: 0, c: 0 };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- The chart ----------
function renderChart() {
  const sheet = $("sheet");
  sheet.className = `sheet theme-${state.theme}`;
  const name = state.name.trim();
  $("sheet-title").textContent = name ? `${name}'s Star Chart` : "My Star Chart";
  $("sheet-week").textContent = `Week of ${weekLabel(state.weekStart)}`;

  const days = weekDays(state.weekStart);
  const today = isoDate(new Date());
  const chart = $("chart");
  chart.replaceChildren();
  chart.style.setProperty("--rows", state.chores.length);

  const head = el("div", { role: "row", class: "r" }, el("div", { role: "columnheader", class: "corner" }));
  days.forEach((d) => head.append(el("div", { role: "columnheader", class: "dayh" + (d.iso === today ? " today" : ""), title: d.long },
    el("span", { class: "dshort", text: d.short }), el("span", { class: "dnum", text: String(d.num) }))));
  chart.append(head);

  if (!state.chores.length) {
    chart.append(el("p", { class: "empty", text: "Add a chore below to start the chart." }));
  }
  if (focusCell.r >= state.chores.length) focusCell = { r: 0, c: focusCell.c };

  state.chores.forEach((ch, r) => {
    const row = el("div", { role: "row", class: "r" },
      el("div", { role: "rowheader", class: "chore" },
        el("span", { class: "cemoji", "aria-hidden": "true", text: ch.emoji }),
        el("span", { class: "clabel", text: ch.label || "Chore" })));
    days.forEach((d, c) => {
      const on = !!state.stars[key(ch.id, c)];
      const btn = el("button", {
        type: "button", class: "cell" + (on ? " on" : "") + (d.iso === today ? " today" : ""),
        "aria-pressed": on ? "true" : "false",
        "aria-label": `${ch.label || "Chore"}, ${d.long}`,
        tabindex: r === focusCell.r && c === focusCell.c ? "0" : "-1",
        "data-r": r, "data-c": c,
      }, star("s"));
      el("div", { role: "gridcell", class: "gc" }).append(btn);
      row.append(btn.parentNode);
    });
    chart.append(row);
  });
  renderReward();
}

function renderReward() {
  const n = countStars(state), goal = state.goal;
  const track = $("track");
  track.replaceChildren();
  for (let i = 0; i < goal; i++) track.append(star("t" + (i < n ? " on" : "")));
  const r = state.reward;
  const what = `${r.emoji} ${r.label || "a treat"}`;
  const line = $("reward-line");
  line.replaceChildren(
    el("span", { class: "screen-only" + (n >= goal ? " won" : ""),
      text: n >= goal ? `Reward earned: ${what}!` : `${n} of ${goal} stars · ${goal - n} more for ${what}` }),
    el("span", { class: "print-only", text: `Fill ${goal} stars to earn: ${what}` }));
}

function onCell(btn) {
  const r = +btn.dataset.r, c = +btn.dataset.c;
  const chore = state.chores[r];
  if (!chore) return;
  const before = countStars(state);
  state = toggleStar(state, chore.id, c);
  save();
  const on = !!state.stars[key(chore.id, c)];
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  if (on && !reduceMotion) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
  renderReward();
  const after = countStars(state);
  if (before < state.goal && after >= state.goal) celebrate();
  else if (after < state.goal) $("party").replaceChildren();
}

function celebrate(burstToo = true) {
  const party = $("party");
  const r = state.reward;
  const who = state.name.trim() || "You";
  party.replaceChildren(el("div", { class: "party-card" },
    el("span", { class: "party-emoji", "aria-hidden": "true", text: r.emoji }),
    el("div", {},
      el("strong", { text: `${who} did it! ${state.goal} stars!` }),
      el("div", { text: `Reward: ${r.label || "a treat"}` }))));
  if (reduceMotion || !burstToo) return;
  const burst = el("div", { class: "burst", "aria-hidden": "true" });
  for (let i = 0; i < 18; i++) {
    const s = star("b");
    const a = (i / 18) * Math.PI * 2, d = 90 + Math.random() * 90;
    s.style.setProperty("--x", `${Math.cos(a) * d}px`);
    s.style.setProperty("--y", `${Math.sin(a) * d}px`);
    s.style.setProperty("--rot", `${Math.random() * 360}deg`);
    burst.append(s);
  }
  document.body.append(burst);
  setTimeout(() => burst.remove(), 1400);
}

$("chart").addEventListener("click", (e) => {
  const btn = e.target.closest("button.cell");
  if (btn) onCell(btn);
});

// Arrow keys move between cells (one tab stop for the whole grid).
$("chart").addEventListener("keydown", (e) => {
  const btn = e.target.closest("button.cell");
  if (!btn) return;
  let r = +btn.dataset.r, c = +btn.dataset.c;
  const rows = state.chores.length;
  const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  if (moves[e.key]) { r += moves[e.key][0]; c += moves[e.key][1]; }
  else if (e.key === "Home") c = 0;
  else if (e.key === "End") c = 6;
  else return;
  e.preventDefault();
  r = Math.max(0, Math.min(rows - 1, r)); c = Math.max(0, Math.min(6, c));
  const next = $("chart").querySelector(`button.cell[data-r="${r}"][data-c="${c}"]`);
  if (!next) return;
  btn.tabIndex = -1; next.tabIndex = 0; next.focus();
  focusCell = { r, c };
});
$("chart").addEventListener("focusin", (e) => {
  const btn = e.target.closest("button.cell");
  if (btn) focusCell = { r: +btn.dataset.r, c: +btn.dataset.c };
});

// ---------- Set-up panel ----------
function renderThemes() {
  const box = $("themes");
  box.replaceChildren();
  const names = { sunshine: "Sunshine", night: "Night sky", ocean: "Ocean", garden: "Garden" };
  for (const t of THEMES) {
    const input = el("input", { type: "radio", name: "theme", value: t, checked: state.theme === t });
    input.addEventListener("change", () => { state.theme = t; save(); renderChart(); });
    box.append(el("label", { class: `swatch sw-${t}` }, input, el("span", { text: names[t] })));
  }
}

function renderChores() {
  const list = $("chores");
  list.replaceChildren();
  state.chores.forEach((ch, i) => {
    const emoji = el("input", { class: "emoji-in", type: "text", maxlength: "16", value: ch.emoji, "aria-label": `Icon for chore ${i + 1}` });
    emoji.addEventListener("input", () => { ch.emoji = emoji.value.trim() || "⭐"; save(); renderChart(); });
    const label = el("input", { class: "grow", type: "text", maxlength: "40", value: ch.label, placeholder: "What to do", "aria-label": `Chore ${i + 1}` });
    label.addEventListener("input", () => { ch.label = label.value; save(); renderChart(); renderPresets(); });
    const up = el("button", { type: "button", class: "icon-btn", "aria-label": `Move ${ch.label || "chore"} up`, disabled: i === 0, text: "↑",
      onclick: () => move(i, -1) });
    const down = el("button", { type: "button", class: "icon-btn", "aria-label": `Move ${ch.label || "chore"} down`, disabled: i === state.chores.length - 1, text: "↓",
      onclick: () => move(i, 1) });
    const del = el("button", { type: "button", class: "icon-btn", "aria-label": `Remove ${ch.label || "chore"}`, text: "✕",
      onclick: () => {
        state.chores.splice(i, 1);
        state.goal = clampGoal(state.goal, state);
        save(); renderAll();
        const rest = $("chores").querySelectorAll("input.grow");
        (rest[Math.min(i, rest.length - 1)] || $("chore-presets").querySelector("button"))?.focus();
      } });
    list.append(el("li", {}, emoji, label, up, down, del));
  });
  $("chore-count").textContent = `(${state.chores.length} of ${MAX_CHORES})`;
}

function move(i, d) {
  const j = i + d;
  const [c] = state.chores.splice(i, 1);
  state.chores.splice(j, 0, c);
  save(); renderAll();
  $("chores").children[j]?.querySelectorAll("button")[d < 0 ? 0 : 1]?.focus();
}

function addChore(preset) {
  if (state.chores.length >= MAX_CHORES) return;
  state.chores.push({ id: newId(), emoji: preset?.emoji || "⭐", label: preset?.label || "" });
  save(); renderAll();
  if (!preset) $("chores").lastElementChild?.querySelector("input.grow")?.focus();
}

function renderPresets() {
  const box = $("chore-presets");
  box.replaceChildren();
  const used = new Set(state.chores.map((c) => c.label.trim().toLowerCase()));
  const full = state.chores.length >= MAX_CHORES;
  for (const p of CHORES) {
    if (used.has(p.label.toLowerCase())) continue;
    box.append(el("button", { type: "button", class: "chip", disabled: full, onclick: () => addChore(p) },
      el("span", { "aria-hidden": "true", text: p.emoji + " " }), p.label));
  }
  box.append(el("button", { type: "button", class: "chip", disabled: full, onclick: () => addChore(null), text: "+ Your own" }));

  const rbox = $("reward-presets");
  rbox.replaceChildren();
  for (const p of REWARDS) {
    const on = state.reward.label === p.label && state.reward.emoji === p.emoji;
    rbox.append(el("button", { type: "button", class: "chip", "aria-pressed": on ? "true" : "false",
      onclick: () => { state.reward = { ...p }; save(); renderRewardEdit(); renderReward(); renderPresets(); } },
      el("span", { "aria-hidden": "true", text: p.emoji + " " }), p.label));
  }
}

function renderRewardEdit() {
  $("reward-emoji").value = state.reward.emoji;
  $("reward-label").value = state.reward.label;
  $("goal").value = state.goal;
  $("goal").max = maxStars(state);
}

function setGoal(v) {
  const before = countStars(state) >= state.goal;
  state.goal = clampGoal(v, state);
  $("goal").value = state.goal;
  save(); renderReward();
  if (countStars(state) < state.goal) $("party").replaceChildren();
  else if (!before) celebrate();
}

$("name").addEventListener("input", (e) => { state.name = e.target.value.slice(0, 30); save(); renderChart(); });
$("week").addEventListener("change", (e) => {
  if (!e.target.value) { e.target.value = state.weekStart; return; }
  state.weekStart = e.target.value; save(); renderChart();
});
$("reward-emoji").addEventListener("input", (e) => { state.reward.emoji = e.target.value.trim() || "🎁"; save(); renderReward(); renderPresets(); });
$("reward-label").addEventListener("input", (e) => { state.reward.label = e.target.value; save(); renderReward(); renderPresets(); });
$("goal").addEventListener("change", (e) => setGoal(e.target.value));
$("goal-down").addEventListener("click", () => setGoal(state.goal - 1));
$("goal-up").addEventListener("click", () => setGoal(state.goal + 1));

// ---------- Toolbar ----------
function print(blank) {
  document.body.classList.toggle("print-blank", blank);
  window.print();
}
addEventListener("afterprint", () => document.body.classList.remove("print-blank"));
$("print").addEventListener("click", () => print(false));
$("print-blank").addEventListener("click", () => print(true));
$("next-week").addEventListener("click", () => {
  if (countStars(state) > 0 && !confirm("Start next week? This clears this week's stars.")) return;
  state = nextWeek(state);
  save(); renderAll();
  $("party").replaceChildren();
});
$("reset").addEventListener("click", () => {
  if (!confirm("Reset the whole chart? This can't be undone.")) return;
  state = defaultState();
  save(); renderAll();
  $("party").replaceChildren();
  $("reset").closest("details").open = false;
});

function renderAll() {
  $("name").value = state.name;
  $("week").value = state.weekStart;
  renderThemes();
  renderChores();
  renderPresets();
  renderRewardEdit();
  renderChart();
}

renderAll();
if (countStars(state) >= state.goal) celebrate(false);
