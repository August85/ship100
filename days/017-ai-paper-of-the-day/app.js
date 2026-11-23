// AI Paper of the Day: Day 17 of Ship 100.
// Data: Hugging Face Daily Papers (public, keyless, CORS-enabled). arXiv's own API has no CORS.
// Bullets: picked from the abstract in the browser. Optional: bring your own Anthropic key.
import { fiveBullets, pickPaper, defaultDate, shiftDate, isoDate, authorLine, asText, parseModelBullets } from "./engine.js";

const API = "https://huggingface.co/api/daily_papers?date=";
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.7.0/+esm";
const MODEL = "claude-opus-5-5";
const $ = (s) => document.querySelector(s);

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const state = { date: null, list: [], index: 0, demo: false };
const today = isoDate(new Date());

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

async function fetchDay(date) {
  const cached = store.get(`p17:day:${date}`);
  // Refresh anything cached more than 6 hours ago (votes keep moving for a while).
  if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.list;
  const res = await fetch(API + date);
  if (!res.ok) throw new Error(`Hugging Face returned ${res.status}`);
  const raw = await res.json();
  const list = pickPaper(raw).slice(0, 8).map((e) => ({
    numComments: e.numComments || 0,
    paper: {
      id: e.paper.id, title: e.paper.title, summary: e.paper.summary, upvotes: e.paper.upvotes || 0,
      publishedAt: e.paper.publishedAt, githubRepo: e.paper.githubRepo || "", projectPage: e.paper.projectPage || "",
      ai_summary: e.paper.ai_summary || "", ai_keywords: e.paper.ai_keywords || [],
      authors: (e.paper.authors || []).map((a) => ({ name: a.name })),
    },
  }));
  if (list.length) store.set(`p17:day:${date}`, { at: Date.now(), list });
  return list;
}

/** Load the requested day, walking back over empty days (weekends, holidays). */
async function load(date, { step = -1 } = {}) {
  setStatus(`Loading papers for ${fmtDate(date)}…`);
  state.demo = false;
  try {
    let d = date;
    for (let i = 0; i < 7 && d <= today; i++) {
      const list = await fetchDay(d);
      if (list.length) { show(d, list); return; }
      d = shiftDate(d, step);
    }
    state.date = date; state.list = []; render();
    setStatus(`No papers posted on or ${step > 0 ? "after" : "before"} ${fmtDate(date)} yet.`);
  } catch (err) {
    const sample = await (await fetch("sample.json")).json();
    state.demo = true;
    show(sample.date, sample.papers);
    setStatus(`Couldn't reach Hugging Face (${err.message}). Showing a saved sample from ${fmtDate(sample.date)}.`);
  }
}

function show(date, list) {
  state.date = date; state.list = list; state.index = 0;
  if (!state.demo) history.replaceState(null, "", `#${date}`);
  setStatus("");
  render();
}

function setStatus(msg) {
  const el = $("#status");
  el.textContent = msg;
  el.hidden = !msg;
}

function currentBullets(paper) {
  const ai = store.get(`p17:ai:${paper.id}`);
  if (ai && ai.length) return { bullets: ai, source: "claude" };
  return { bullets: fiveBullets(paper.summary), source: "abstract" };
}

function render() {
  $("#date").textContent = state.date ? fmtDate(state.date) : "";
  $("#next").disabled = !state.date || state.date >= today || state.demo;
  $("#prev").disabled = !state.date || state.demo;
  const card = $("#paper");
  const entry = state.list[state.index];
  if (!entry) { card.hidden = true; $("#others").hidden = true; return; }
  card.hidden = false;
  const p = entry.paper;
  const { bullets, source } = currentBullets(p);
  const rank = state.index === 0 ? "Paper of the day" : `#${state.index + 1} that day`;
  card.innerHTML = `
    <p class="kicker">${esc(rank)} · ▲ ${p.upvotes} upvotes${entry.numComments ? ` · ${entry.numComments} comments` : ""}</p>
    <h2 class="title">${esc(p.title)}</h2>
    <p class="authors">${esc(authorLine(p.authors))}</p>
    <ol class="bullets">
      ${bullets.map((b) => `<li><span class="label">${esc(b.label)}</span> ${esc(b.text)}</li>`).join("")}
    </ol>
    <p class="source muted">${source === "claude"
      ? `Summarized by Claude (${MODEL}) with your key. <button class="link" id="clear-ai" type="button">Show the abstract version</button>`
      : "These five sentences are picked straight from the abstract, no AI involved."}</p>
    ${p.ai_summary ? `<p class="tldr"><strong>One-line TL;DR</strong> ${esc(p.ai_summary)} <span class="muted">(from Hugging Face)</span></p>` : ""}
    ${p.ai_keywords.length ? `<p class="tags">${p.ai_keywords.slice(0, 6).map((k) => `<span>${esc(k)}</span>`).join("")}</p>` : ""}
    <div class="links">
      <a class="btn primary" href="https://arxiv.org/abs/${esc(p.id)}" target="_blank" rel="noopener">arXiv ${esc(p.id)}</a>
      <a class="btn" href="https://arxiv.org/pdf/${esc(p.id)}" target="_blank" rel="noopener">PDF</a>
      <a class="btn" href="https://huggingface.co/papers/${esc(p.id)}" target="_blank" rel="noopener">Discussion</a>
      ${p.githubRepo ? `<a class="btn" href="${esc(p.githubRepo)}" target="_blank" rel="noopener">Code</a>` : ""}
      <button class="btn" id="copy" type="button">Copy summary</button>
    </div>
    <details class="abstract"><summary>Read the full abstract</summary><p>${esc(p.summary)}</p></details>
  `;
  $("#copy").onclick = async () => {
    try { await navigator.clipboard.writeText(asText(p, bullets)); flash("#copy", "Copied"); }
    catch { flash("#copy", "Copy failed"); }
  };
  const clear = $("#clear-ai");
  if (clear) clear.onclick = () => { store.del(`p17:ai:${p.id}`); render(); };
  $("#ai-go").disabled = source === "claude";

  const others = state.list.map((e, i) => ({ e, i })).filter(({ i }) => i !== state.index).slice(0, 4);
  $("#others").hidden = !others.length;
  $("#others-list").innerHTML = others.map(({ e, i }) =>
    `<li><button type="button" class="other" data-i="${i}"><span class="votes">▲ ${e.paper.upvotes}</span> <span>${esc(e.paper.title)}</span></button></li>`).join("");
  document.querySelectorAll(".other").forEach((b) => (b.onclick = () => {
    state.index = Number(b.dataset.i); render(); $("#paper").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function flash(sel, text) {
  const el = $(sel); if (!el) return;
  const old = el.textContent; el.textContent = text;
  setTimeout(() => { el.textContent = old; }, 1500);
}

// ---- Optional: bring your own Anthropic key ----
async function summarizeWithClaude() {
  const entry = state.list[state.index];
  const key = $("#key").value.trim();
  if (!entry) return;
  if (!key) { $("#ai-msg").textContent = "Paste an Anthropic API key first."; return; }
  if ($("#remember").checked) store.set("p17:key", key); else store.del("p17:key");
  const btn = $("#ai-go");
  btn.disabled = true; $("#ai-msg").textContent = "Asking Claude…";
  try {
    const { default: Anthropic } = await import(SDK_URL);
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const p = entry.paper;
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: "You summarize research papers for busy engineers. Plain words, no hype, explain any jargon you keep.",
      messages: [{
        role: "user",
        content: `Summarize this paper in exactly 5 bullets, one line each, under 30 words each.\nUse these labels in this order:\n- The problem:\n- The gap:\n- What they did:\n- Key result:\n- Why it matters:\nOnly use facts from the abstract. Output only the 5 bullets.\n\nTitle: ${p.title}\n\nAbstract: ${p.summary}`,
      }],
    });
    if (msg.stop_reason === "refusal") throw new Error("Claude declined to summarize this one.");
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const bullets = parseModelBullets(text);
    if (bullets.length < 3) throw new Error("the reply didn't look like five bullets.");
    store.set(`p17:ai:${p.id}`, bullets);
    $("#ai-msg").textContent = "";
    render();
  } catch (err) {
    $("#ai-msg").textContent = `Couldn't summarize: ${err.message || err}`;
    btn.disabled = false;
  }
}

$("#prev").onclick = () => load(shiftDate(state.date, -1));
$("#next").onclick = () => {
  const d = shiftDate(state.date, 1);
  if (d <= today) load(d, { step: 1 });
};
$("#ai-go").onclick = summarizeWithClaude;
const savedKey = store.get("p17:key");
if (savedKey) { $("#key").value = savedKey; $("#remember").checked = true; }

const fromHash = location.hash.slice(1);
load(/^\d{4}-\d{2}-\d{2}$/.test(fromHash) && fromHash <= today ? fromHash : defaultDate());
