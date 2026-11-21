// Return-to-India Readiness Score: Day 15 of Ship 100.
// Plain ES module, no build step. Answers live only in localStorage.
import { ANSWERS, CATEGORIES, QUESTIONS, score, summaryText } from "./engine.js";

const KEY = "ship100.d015.answers";
const $ = (s) => document.querySelector(s);
const form = $("#quiz");

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode */ } };

let answers = load();

const WEIGHT = { 3: "Critical", 2: "Important", 1: "Nice to have" };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
}

function build() {
  let n = 0;
  for (const c of CATEGORIES) {
    const sec = el("section", { class: "card cat", "aria-labelledby": `h-${c.key}` },
      el("h2", { id: `h-${c.key}`, text: c.label }));
    for (const q of QUESTIONS.filter((q) => q.cat === c.key)) {
      n++;
      const legend = el("legend", {}, el("span", { class: "num", text: String(n) }), el("span", { text: q.q }));
      if (q.weight === 3) legend.append(el("span", { class: "tag", text: "Critical" }));
      const fs = el("fieldset", { class: "q", id: `q-${q.id}` }, legend);
      const opts = el("div", { class: "opts" });
      for (const a of ANSWERS) {
        if (a.key === "na" && !q.naOk) continue;
        const input = el("input", { type: "radio", name: q.id, value: a.key, id: `${q.id}-${a.key}` });
        if (answers[q.id] === a.key) input.checked = true;
        opts.append(el("label", { class: `opt opt-${a.key}`, for: `${q.id}-${a.key}` }, input, el("span", { text: a.label })));
      }
      fs.append(opts);
      sec.append(fs);
    }
    form.append(sec);
  }
}

function render() {
  const r = score(answers);
  $("#pct").textContent = r.pct;
  $("#dial").style.setProperty("--p", r.pct);
  $("#band").textContent = r.band.label;
  $("#progress").textContent = r.answered === r.total ? "All 20 answered" : `${r.answered} of ${r.total} answered`;

  const crit = r.criticalOpen ? ` ${r.criticalOpen} critical item${r.criticalOpen > 1 ? "s" : ""} not started yet.` : "";
  $("#note").textContent = `${r.pct}/100 · ${r.band.label}. ${r.band.note}${crit}`;

  $("#cats").replaceChildren(...r.categories.map((c) =>
    el("div", { class: "catrow" },
      el("span", { text: c.label }),
      el("span", { class: "meter", role: "img", "aria-label": c.pct === null ? `${c.label}: doesn't apply` : `${c.label}: ${c.pct}%` },
        el("span", { style: `width:${c.pct ?? 0}%` })),
      el("span", { class: "catpct", text: c.pct === null ? "n/a" : `${c.pct}%` }))));

  const gaps = r.gaps.slice(0, 6);
  $("#gaps").replaceChildren(...(gaps.length ? gaps.map((g) =>
    el("li", {},
      el("a", { href: `#q-${g.id}`, text: g.q }),
      el("span", { class: "meta", text: `${WEIGHT[g.weight]} · ${g.answer === "partly" ? "in progress" : g.answer ? "not yet" : "unanswered"}` }),
      el("p", { text: g.tip }))) : [el("li", { class: "none", text: "Nothing left. Safe travels." })]));
}

form.addEventListener("change", (e) => {
  if (e.target.type !== "radio") return;
  answers = { ...answers, [e.target.name]: e.target.value };
  save(answers);
  render();
});

function setAll(next) {
  answers = next;
  save(answers);
  for (const input of form.querySelectorAll("input[type=radio]")) input.checked = answers[input.name] === input.value;
  render();
}

function flash(msg) {
  $("#status").textContent = msg;
  setTimeout(() => { if ($("#status").textContent === msg) $("#status").textContent = ""; }, 2500);
}

$("#copy").addEventListener("click", async () => {
  const text = summaryText(score(answers)) + "\n\nhttps://august85.github.io/ship100/days/015-return-to-india-readiness-score/";
  try { await navigator.clipboard.writeText(text); flash("Copied."); }
  catch { flash("Couldn't copy. Select the result and copy it by hand."); }
});

// Made-up example: a family about a year out.
$("#demo").addEventListener("click", () => setAll({
  fund: "done", rnor: "partly", retire: "partly", broker: "no", nre: "no", budget: "done",
  job: "partly", health: "no", "us-cover": "no", house: "done", "us-assets": "partly", ship: "no", phone: "done",
  partner: "done", school: "partly", parents: "done", oci: "partly", ids: "done", credit: "partly", exit: "no",
}));

$("#reset").addEventListener("click", () => {
  if (Object.keys(answers).length && !confirm("Clear all answers?")) return;
  setAll({});
  window.scrollTo({ top: 0, behavior: "smooth" });
});

build();
render();
// The quiz is built after load, so a #hash link needs scrolling again once it exists.
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
