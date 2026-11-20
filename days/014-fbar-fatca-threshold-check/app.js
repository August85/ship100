// FBAR / FATCA Threshold Check: Day 14 of Ship 100.
// Plain ES module, no build step. Balances stay in localStorage on this device.

import {
  ACCOUNT_TYPES, YEAR_END_RATES, evaluate, parseInr, formatInr, formatUsd,
} from "./engine.js";

const KEY = "ship100.fbar.v1";
const $ = (s) => document.querySelector(s);
const yearSel = $("#year"), statusSel = $("#status"), rateIn = $("#rate"),
  rateSrc = $("#rateSrc"), abroadCb = $("#abroad"), list = $("#accounts"),
  tpl = $("#rowTpl"), fbarCard = $("#fbarCard"), f8938Card = $("#f8938Card");

// Year-end rates (+ latest quarterly rate for the year in progress).
const rates = { ...YEAR_END_RATES };
let latest = null; // { year, date, rate } for a year without a 31 Dec rate yet
const thisYear = new Date().getFullYear();

const blank = () => ({ name: "", type: "savings", maxInr: "", endInr: "" });
const DEMO = [
  { name: "SBI NRO savings", type: "savings", maxInr: "6,40,000", endInr: "3,10,000" },
  { name: "HDFC NRE fixed deposit", type: "fd", maxInr: "15,00,000", endInr: "15,00,000" },
  { name: "Demat account", type: "demat", maxInr: "22,50,000", endInr: "20,80,000" },
  { name: "PPF", type: "ppf", maxInr: "9,75,000", endInr: "9,75,000" },
  { name: "Parents' account (signer only)", type: "savings", maxInr: "4,20,000", endInr: "2,00,000", signatureOnly: true },
];

const state = load() || {
  year: String(thisYear - 1), status: "single", abroad: false, rateOverride: "",
  accounts: [blank()],
};
if (!Array.isArray(state.accounts) || !state.accounts.length) state.accounts = [blank()];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

// ---------- settings ----------
function fillYears() {
  const years = [];
  for (let y = thisYear; y >= 2019; y--) years.push(y);
  yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  if (!years.includes(Number(state.year))) state.year = String(thisYear - 1);
  yearSel.value = state.year;
}

function rateFor(year) {
  if (rates[year]) return { rate: rates[year], note: `Treasury rate for 31 Dec ${year}.` };
  if (latest && Number(year) >= latest.year) {
    return { rate: latest.rate, provisional: true, note: `Provisional: latest Treasury rate (${latest.date}); the 31 Dec ${year} rate isn't out yet.` };
  }
  const known = Math.max(...Object.keys(rates).map(Number));
  return { rate: rates[known], provisional: true, note: `Provisional: using the 31 Dec ${known} rate.` };
}

const overrideValue = () => parseFloat(String(state.rateOverride || "").replace(/,/g, ""));
const currentRate = () => (overrideValue() > 0 ? overrideValue() : rateFor(state.year).rate);

function showRate() {
  const r = rateFor(state.year);
  if (document.activeElement !== rateIn) rateIn.value = state.rateOverride || r.rate;
  rateSrc.textContent = overrideValue() > 0
    ? `Using your rate. The Treasury figure is ₹${r.rate}; clear the box to go back to it.`
    : `₹${r.rate} = $1. ${r.note}`;
}

async function refreshRates() {
  const url = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/rates_of_exchange"
    + "?fields=record_date,exchange_rate&filter=country_currency_desc:eq:India-Rupee,record_date:gte:2019-01-01"
    + "&sort=-record_date&page%5Bsize%5D=100";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const { data } = await res.json();
    let newest = null;
    for (const d of data) {
      const rate = parseFloat(d.exchange_rate);
      if (!(rate > 0)) continue;
      const [y, m, day] = d.record_date.split("-");
      if (m === "12" && day === "31") rates[y] = rate;
      if (!newest) newest = { year: Number(y), date: d.record_date, rate };
    }
    // Only provisional if the newest rate belongs to a year that has no 31 Dec rate.
    if (newest) latest = rates[newest.year] ? { ...newest, year: newest.year + 1 } : newest;
  } catch {
    // Offline or API down: keep the bundled rates.
  }
  showRate();
  update();
}

// ---------- account rows ----------
const typeOptions = Object.entries(ACCOUNT_TYPES)
  .map(([v, t]) => `<option value="${v}">${t.label}</option>`).join("");

function renderRows() {
  list.replaceChildren(...state.accounts.map(makeRow));
}

function makeRow(a, i) {
  const el = tpl.content.firstElementChild.cloneNode(true);
  const q = (s) => el.querySelector(s);
  q(".type").innerHTML = typeOptions;
  q(".name").value = a.name || "";
  q(".type").value = ACCOUNT_TYPES[a.type] ? a.type : "other";
  q(".max").value = a.maxInr || "";
  q(".end").value = a.endInr || "";
  q(".count").checked = a.count !== false;
  q(".sig").checked = !!a.signatureOnly;
  q(".closed").checked = !!a.closed;
  el.dataset.i = i;

  const decorate = () => {
    q(".end").disabled = q(".closed").checked;
    const grey = ACCOUNT_TYPES[q(".type").value]?.grey;
    q(".grey").hidden = !grey;
    q(".grey").textContent = grey || "";
    el.classList.toggle("off", !q(".count").checked);
  };
  const sync = () => {
    Object.assign(state.accounts[i], {
      name: q(".name").value, type: q(".type").value,
      maxInr: q(".max").value, endInr: q(".end").value,
      count: q(".count").checked, signatureOnly: q(".sig").checked, closed: q(".closed").checked,
    });
    decorate();
    update();
  };
  el.addEventListener("input", sync);
  el.addEventListener("change", sync);
  // Tidy number formatting when leaving a field: 1234567 → 12,34,567
  for (const f of [q(".max"), q(".end")]) {
    f.addEventListener("blur", () => {
      const n = parseInr(f.value);
      const tidy = n ? n.toLocaleString("en-IN") : "";
      if (tidy !== f.value) { f.value = tidy; sync(); }
    });
  }
  q(".remove").addEventListener("click", () => {
    state.accounts.splice(i, 1);
    if (!state.accounts.length) state.accounts.push(blank());
    renderRows();
    update();
    $("#add").focus();
  });
  decorate();
  return el;
}

// ---------- results ----------
function meter(value, limit, label) {
  const pct = Math.min(100, (value / limit) * 100);
  const cls = value > limit ? "over" : pct >= 80 ? "near" : "";
  return `<div class="meter-label"><span>${label}</span><span><strong>${formatUsd(value)}</strong> / ${formatUsd(limit)}</span></div>
    <div class="meter ${cls}" role="img" aria-label="${label}: ${formatUsd(value)} of ${formatUsd(limit)}"><span style="width:${pct.toFixed(1)}%"></span></div>`;
}

function headroomLine(usd, rate) {
  if (usd < 0) return `Over the line by ${formatUsd(-usd)} (${formatInr(-usd * rate)}).`;
  return `${formatUsd(usd)} (${formatInr(usd * rate)}) of room before you'd have to file.`;
}

const STATUS_NAME = { single: "single", mfj: "married filing jointly", mfs: "married filing separately" };

function update() {
  save();
  const rate = currentRate();
  const accts = state.accounts.filter((a) => a.count !== false);
  const r = evaluate(accts, { rate, status: state.status, abroad: state.abroad });
  const next = Number(state.year) + 1;

  list.querySelectorAll(".acct").forEach((el) => {
    const a = state.accounts[el.dataset.i];
    const max = Math.max(parseInr(a.maxInr), parseInr(a.endInr));
    el.querySelector(".usd").textContent = max ? `≈ ${formatUsd(max / rate)} at peak` : "";
  });

  const empty = !accts.some((a) => parseInr(a.maxInr) || parseInr(a.endInr));
  const prov = rateFor(state.year).provisional && !(overrideValue() > 0);
  const provNote = prov ? `<p class="muted small">Provisional rate: check again after the 31 Dec ${state.year} rate is published.</p>` : "";
  const answer = (req) => (empty ? "Add a balance" : req ? "You need to file" : "Not required");
  const cls = (req) => "card verdict " + (empty ? "" : req ? "yes" : "no");

  const f = r.fbar;
  fbarCard.className = cls(f.required);
  fbarCard.innerHTML = `
    <p class="form-name">FBAR · FinCEN 114</p>
    <p class="answer">${answer(f.required)}</p>
    ${meter(f.total, f.limit, "Highest balances, added up")}
    <p class="small">${empty ? "Fill in at least one account above." : headroomLine(f.headroom, rate)}</p>
    ${!empty && f.required ? `<p class="small muted">File online at BSA E-Filing by 15 April ${next} (automatic extension to 15 October). List every foreign account, not just the big ones.</p>` : ""}
    ${provNote}`;

  const g = r.f8938;
  const who = `${STATUS_NAME[state.status]}, ${state.abroad ? "living abroad" : "living in the US"}`;
  f8938Card.className = cls(g.required);
  f8938Card.innerHTML = `
    <p class="form-name">FATCA · Form 8938</p>
    <p class="answer">${answer(g.required)}</p>
    ${meter(g.yearEnd, g.endLimit, "On 31 December")}
    ${meter(g.anyTime, g.anyLimit, "At any time in the year")}
    <p class="small">${empty ? "" : headroomLine(g.headroom, rate) + " "}Limits for ${who}.</p>
    ${!empty && g.required ? `<p class="small muted">Attach it to the Form 1040 you file in ${next}; only needed if you have to file a US return. It's on top of the FBAR, not instead of it.</p>` : ""}
    ${provNote}`;
}

// ---------- wire up ----------
fillYears();
statusSel.value = state.status;
abroadCb.checked = !!state.abroad;
renderRows();
showRate();
update();
refreshRates();

yearSel.addEventListener("change", () => { state.year = yearSel.value; state.rateOverride = ""; showRate(); update(); });
statusSel.addEventListener("change", () => { state.status = statusSel.value; update(); });
abroadCb.addEventListener("change", () => { state.abroad = abroadCb.checked; update(); });
rateIn.addEventListener("input", () => {
  const v = rateIn.value.trim();
  state.rateOverride = parseFloat(v) === rateFor(state.year).rate ? "" : v;
  showRate();
  update();
});
rateIn.addEventListener("blur", showRate);

$("#add").addEventListener("click", () => {
  state.accounts.push(blank());
  renderRows();
  update();
  list.querySelector(".acct:last-child .name").focus();
});
$("#demo").addEventListener("click", () => {
  state.accounts = DEMO.map((a) => ({ ...a }));
  renderRows();
  update();
});
$("#clear").addEventListener("click", () => {
  state.accounts = [blank()];
  state.rateOverride = "";
  renderRows();
  showRate();
  update();
});
