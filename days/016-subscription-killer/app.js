// Subscription Killer: Day 16 of Ship 100.
// Plain ES module, no build step. Statements are read with FileReader and never leave the page.
import { parseCSV, detectColumns, toTransactions, findRecurring, summaryText, toCSV } from "./engine.js";
import { sampleCSV } from "./sample.js";

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let rows = null, result = null;
const marked = new Set();
let currency = store.get("sk.currency") || "USD";
$("#cur").value = currency;

const fmt = (n) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n);

// ---------- Input ----------
$("#file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ""; });
$("#sample").addEventListener("click", () => load(sampleCSV(), "demo"));

const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
// Accept a drop anywhere on the page, so a near miss doesn't open the file in a new tab.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) readFile(f); });

function readFile(f) {
  if (f.size > 20 * 1024 * 1024) return toast("That file is over 20 MB. Export a shorter date range.");
  const r = new FileReader();
  r.onload = () => load(String(r.result), f.name);
  r.onerror = () => toast("Couldn't read that file.");
  r.readAsText(f);
}

function load(text, source) {
  rows = parseCSV(text);
  if (rows.length < 2) return toast("That file doesn't look like a CSV with transactions.");
  const cols = detectColumns(rows);
  if (!cols) return showMapper();
  if (source === "demo") setCurrency("USD", false);
  else if (/narration|withdrawal|chq|ref no/i.test(cols.headers.join(" ")) && !store.get("sk.currency")) setCurrency("INR", false);
  run(cols);
}

function showMapper() {
  $("#mapper").hidden = false;
  $("#results").hidden = true;
  const width = Math.max(...rows.slice(0, 5).map((r) => r.length));
  const opts = Array.from({ length: width }, (_, i) => `<option value="${i}">${esc(rows[0][i] || `Column ${i + 1}`)}</option>`).join("");
  ["#m-date", "#m-desc", "#m-amount"].forEach((s, i) => { $(s).innerHTML = opts; $(s).value = String(Math.min(i, width - 1)); });
  $("#m-date").focus();
}
$("#m-go").addEventListener("click", () => {
  const cols = { headerRow: 0, date: +$("#m-date").value, desc: +$("#m-desc").value, amount: +$("#m-amount").value, debit: -1, credit: -1, headers: rows[0] };
  // If the first row is data rather than headers, include it.
  if (/\d/.test(rows[0][cols.amount] ?? "") && /\d/.test(rows[0][cols.date] ?? "")) cols.headerRow = -1;
  run(cols);
});

function run(cols) {
  const t = toTransactions(rows, cols);
  if (!t.txns.length) { toast("Found the columns but no charges in them. Check the amount column."); return showMapper(); }
  result = findRecurring(t.txns);
  marked.clear();
  $("#mapper").hidden = true;
  $("#results").hidden = false;
  render();
  $("#results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

// ---------- Render ----------
function render() {
  const active = result.items.filter((i) => i.status === "active");
  const stopped = result.items.filter((i) => i.status === "stopped");
  $("#s-count").textContent = active.length;
  $("#s-month").textContent = fmt(result.totalMonthly);
  $("#s-year").textContent = fmt(result.totalYearly);
  const months = Math.max(1, Math.round((Date.parse(result.end) - Date.parse(result.start)) / 86400000 / 30.4));
  $("#range").textContent = `${result.count} charges from ${niceDate(result.start)} to ${niceDate(result.end)} (about ${months} month${months === 1 ? "" : "s"}).` +
    (months < 3 ? " Three or more months finds more." : months < 12 ? " Yearly renewals need 13 months to show up." : "");
  $("#active").innerHTML = active.map(card).join("");
  $("#stopped").innerHTML = stopped.map(card).join("");
  $("#none").hidden = active.length > 0;
  $("#stopped-wrap").hidden = !stopped.length;
  updateKill();
}

function card(i) {
  const on = marked.has(i.key);
  const up = i.priceChange > 0 ? `<span class="tag up">up ${fmt(i.priceChange)}</span>` : i.priceChange < 0 ? `<span class="tag">down ${fmt(-i.priceChange)}</span>` : "";
  const when = i.status === "active" ? `next around ${niceDate(i.next)}` : `last charged ${niceDate(i.last)}`;
  const id = `c-${i.key.replace(/[^\w]/g, "_")}`;
  const box = i.status === "active"
    ? `<input type="checkbox" id="${id}" data-key="${esc(i.key)}" ${on ? "checked" : ""}>`
    : `<span class="paused" aria-hidden="true">⏸</span>`;
  return `<li class="sub ${on ? "marked" : ""}">
    <div class="sub-top">
      ${box}
      <label for="${id}"><span class="name">${esc(i.name)}</span>${up}<br>
        <span class="meta">${i.cadenceLabel} · ${i.charges.length} charges · ${when}</span></label>
      <div class="price"><span class="amt">${fmt(i.amount)}</span><span class="yr">${fmt(i.yearly)}/yr</span></div>
    </div>
    <details><summary>How to cancel · charge history</summary>
      <p class="hint">${esc(i.hint)}</p>
      <ul class="charges">${[...i.charges].reverse().map((c) => `<li>${c.date} · ${fmt(c.amount)}</li>`).join("")}</ul>
      <p class="meta">Seen as “${esc(i.charges[i.charges.length - 1].desc)}” · ${i.confidence}% sure</p>
    </details>
  </li>`;
}

document.addEventListener("change", (e) => {
  const k = e.target.dataset?.key;
  if (!k) return;
  e.target.checked ? marked.add(k) : marked.delete(k);
  e.target.closest(".sub").classList.toggle("marked", e.target.checked);
  updateKill();
});

function updateKill() {
  const picks = result.items.filter((i) => marked.has(i.key) && i.status === "active");
  $("#kill").hidden = !picks.length;
  $("#k-n").textContent = picks.length;
  $("#k-save").textContent = fmt(picks.reduce((s, i) => s + i.yearly, 0));
}

// ---------- Toolbar ----------
$("#cur").addEventListener("change", (e) => setCurrency(e.target.value));
function setCurrency(c, save = true) {
  currency = c; $("#cur").value = c;
  if (save) store.set("sk.currency", c);
  if (result) render();
}
$("#copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summaryText(result, marked, fmt)); toast("Copied"); }
  catch { toast("Clipboard blocked by the browser"); }
});
$("#dl").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([toCSV(result)], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "recurring-charges.csv" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("#reset").addEventListener("click", () => {
  rows = result = null; marked.clear();
  $("#results").hidden = true; $("#mapper").hidden = true;
  window.scrollTo(0, 0); $("#file").focus();
});

// ---------- Helpers ----------
function niceDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
let toastTimer;
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = Object.assign(document.createElement("div"), { id: "toast" }); t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2500);
}
