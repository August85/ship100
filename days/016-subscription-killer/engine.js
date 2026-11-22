// Subscription Killer engine: pure functions, no DOM, no network.
// parseCSV → toTransactions → findRecurring.

// ---------- CSV ----------
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  text = String(text).replace(/^﻿/, "");
  const delim = sniffDelimiter(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

function sniffDelimiter(text) {
  const head = text.split(/\r?\n/).slice(0, 5).join("\n");
  const count = (ch) => head.split(ch).length - 1;
  const opts = [",", ";", "\t", "|"].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1]);
  return opts[0][1] > 0 ? opts[0][0] : ",";
}

// ---------- Columns ----------
const H = {
  date: [/^(trans(action)?\.?\s*)?date$/i, /^(posted|post(ing)?)\s*date$/i, /date/i],
  desc: [/^description$/i, /^(payee|merchant|narration|details|name|memo|particulars)$/i, /desc|payee|merchant|narration|detail|particular/i],
  amount: [/^amount$/i, /amount/i],
  debit: [/^(debit|withdrawal|withdrawals|charge|charges)/i, /debit|withdrawal/i],
  credit: [/^(credit|deposit|deposits|payment)/i, /credit|deposit/i],
};

// Finds the header row (first row with a date-like and amount-like column) and maps columns.
export function detectColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const hdr = rows[r].map((h) => h.replace(/\s+/g, " ").trim());
    const find = (key, skip = []) => {
      for (const re of H[key]) {
        const i = hdr.findIndex((h, j) => h && re.test(h) && !skip.includes(j));
        if (i >= 0) return i;
      }
      return -1;
    };
    const date = find("date");
    if (date < 0) continue;
    const desc = find("desc", [date]);
    const amount = find("amount", [date, desc]);
    const debit = find("debit", [date, desc, amount]);
    const credit = find("credit", [date, desc, amount, debit]);
    if (desc >= 0 && (amount >= 0 || debit >= 0)) {
      return { headerRow: r, date, desc, amount, debit: amount >= 0 ? -1 : debit, credit: amount >= 0 ? -1 : credit, headers: hdr };
    }
  }
  return null;
}

// ---------- Values ----------
export function parseAmount(s) {
  if (s == null) return NaN;
  let t = String(s).trim();
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bDR\b/i.test(t)) neg = true;
  t = t.replace(/\b(CR|DR)\b/gi, "").replace(/[^\d.,\-]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1); }
  // European style "1.234,56" → 1234.56
  if (/,\d{2}$/.test(t) && !/\.\d{2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

// Returns {y,m,d} parts or null. order: "mdy" | "dmy" decides ambiguous a/b/yyyy dates.
export function parseDateParts(s, order = "mdy") {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,4})[a-z]*[-/. ,]+(\d{2,4})/);
  if (m && MON[m[2].toLowerCase()]) return mk(year(+m[3]), MON[m[2].toLowerCase()], +m[1]);
  m = t.match(/^([A-Za-z]{3,4})[a-z]*[ -](\d{1,2}),?[ -](\d{2,4})/);
  if (m && MON[m[1].toLowerCase()]) return mk(year(+m[3]), MON[m[1].toLowerCase()], +m[2]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const a = +m[1], b = +m[2], y = year(+m[3]);
    return order === "dmy" ? mk(y, b, a) : mk(y, a, b);
  }
  return null;
}
const year = (y) => (y < 100 ? 2000 + y : y);
function mk(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}
const toDay = (p) => Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
export const dayToISO = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

// Day-first if any a/b/yyyy value has a first part over 12 (e.g. Indian and UK bank exports).
export function guessDateOrder(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = String(v).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  return dmy > mdy ? "dmy" : "mdy";
}

// ---------- Transactions ----------
// Returns { txns: [{day, date, desc, amount}], skipped, chargeSign, cols }
// amount is always positive for money going out (charges). Credits and refunds are dropped.
export function toTransactions(rows, cols = detectColumns(rows)) {
  if (!cols) return { txns: [], skipped: rows.length, cols: null, error: "Couldn't find date, description and amount columns." };
  const body = rows.slice(cols.headerRow + 1);
  const order = guessDateOrder(body.map((r) => r[cols.date]));
  const raw = [];
  let skipped = 0;
  for (const r of body) {
    const p = parseDateParts(r[cols.date] ?? "", order);
    const desc = (r[cols.desc] ?? "").trim();
    let amt;
    if (cols.amount >= 0) amt = parseAmount(r[cols.amount]);
    else {
      const d = parseAmount(r[cols.debit]), c = parseAmount(r[cols.credit]);
      amt = Number.isFinite(d) && d !== 0 ? Math.abs(d) : Number.isFinite(c) && c !== 0 ? -Math.abs(c) : NaN;
    }
    if (!p || !desc || !Number.isFinite(amt) || amt === 0) { skipped++; continue; }
    raw.push({ day: toDay(p), desc, amount: amt });
  }
  // Single amount column: whichever sign most rows have is a charge (statements are mostly purchases).
  let chargeSign = 1;
  if (cols.amount >= 0) {
    const neg = raw.filter((t) => t.amount < 0).length;
    chargeSign = neg > raw.length / 2 ? -1 : 1;
  }
  const txns = [];
  for (const t of raw) {
    const a = t.amount * chargeSign;
    if (a <= 0 || isPaymentOrTransfer(t.desc)) continue;
    txns.push({ day: t.day, date: dayToISO(t.day), desc: t.desc, amount: round2(a) });
  }
  txns.sort((a, b) => a.day - b.day);
  return { txns, skipped, chargeSign, cols, order };
}

const PAYMENT_RE = /\b(autopay|payment\s*(thank|received|-)|thank you|online payment|transfer|xfer|interest charge|late fee|annual membership fee rebate|cash ?back|reward|refund|reversal|neft|imps|rtgs|upi\/p2p|atm|withdrawal|zelle|venmo cashout)\b/i;
export const isPaymentOrTransfer = (d) => PAYMENT_RE.test(d);

// ---------- Merchants ----------
// Known subscription brands. name, match regex, and a short "how to cancel" hint.
export const KNOWN = [
  ["Netflix", /netflix/i, "netflix.com → Account → Cancel membership"],
  ["Spotify", /spotify/i, "spotify.com/account → Manage your plan"],
  ["Apple (App Store / iCloud)", /apple\.com\/bill|itunes|apple services|icloud/i, "iPhone Settings → your name → Subscriptions"],
  ["Google Play / One", /google \*|google\s*(play|one|storage)|google\*/i, "Play Store → Profile → Payments & subscriptions"],
  ["YouTube Premium", /youtube/i, "youtube.com/paid_memberships"],
  ["Amazon Prime", /prime video|amazon prime|amzn prime|prime member|primevideo/i, "amazon.com → Account → Prime → End membership"],
  ["Audible", /audible/i, "audible.com → Account details → Cancel membership"],
  ["Disney+", /disney/i, "disneyplus.com → Account → Subscription"],
  ["Hulu", /hulu/i, "hulu.com/account → Cancel"],
  ["Max", /\bhbo|\bmax\.com|hbomax/i, "max.com → Settings → Subscription"],
  ["Paramount+", /paramount/i, "paramountplus.com → Account → Cancel"],
  ["Peacock", /peacock/i, "peacocktv.com → Account → Plans"],
  ["ChatGPT", /openai|chatgpt/i, "chatgpt.com → Settings → Account → Manage"],
  ["Claude", /anthropic|claude\.ai/i, "claude.ai → Settings → Billing"],
  ["GitHub", /github/i, "github.com/settings/billing"],
  ["Adobe", /adobe/i, "account.adobe.com/plans (check the early-cancel fee)"],
  ["Microsoft 365", /microsoft|msft|xbox/i, "account.microsoft.com/services"],
  ["Dropbox", /dropbox/i, "dropbox.com/account/plan"],
  ["Notion", /notion/i, "Notion → Settings → Plans"],
  ["New York Times", /nytimes|ny times|new york times/i, "nytimes.com/account (or chat with support)"],
  ["Wall Street Journal", /wsj|dow jones/i, "Call customer service; online cancel varies by state"],
  ["Peloton", /peloton/i, "onepeloton.com → Settings → Subscriptions"],
  ["Planet Fitness", /planet fit/i, "Cancel at your home club or online if your state allows"],
  ["Gym", /\b(gym|fitness|crunch|equinox|la fitness|24 hour|orangetheory|anytime fit)/i, "Gyms often need a letter or in-person visit; read your contract"],
  ["Uber One", /uber ?one/i, "Uber app → Account → Uber One → Manage"],
  ["DoorDash DashPass", /dashpass/i, "DoorDash app → Account → DashPass"],
  ["Instacart+", /instacart\+|instacart express|instacart member/i, "Instacart → Account → Instacart+"],
  ["Costco membership", /costco.*member|costco annual/i, "Any Costco membership counter, or online"],
  ["LinkedIn Premium", /linkedin/i, "linkedin.com → Me → Premium features → Cancel"],
  ["Duolingo", /duolingo/i, "Cancel in the app store you subscribed from"],
  ["Headspace / Calm", /headspace|calm\.com|\bcalm\b/i, "Cancel in the app store you subscribed from"],
  ["SiriusXM", /sirius/i, "Usually by phone or chat; ask for the retention rate first"],
  ["Hotstar / JioCinema", /hotstar|jiocinema|jio ?hotstar/i, "Hotstar app → My Account → Subscription"],
  ["Zee5 / SonyLIV", /zee5|sonyliv/i, "App → My Account → Subscription"],
  ["Phone / internet", /verizon|t-mobile|tmobile|at&t|\batt\b|comcast|xfinity|spectrum|mint mobile|visible|airtel|jio\b|vodafone|\bvi\b|act fibernet/i, "A bill, not a subscription: check you're on the cheapest plan"],
];

const KNOWN_CANCEL = new Map(KNOWN.map(([n, , h]) => [n, h]));

// Turns "SQ *BLUE BOTTLE #123 OAKLAND CA" into "BLUE BOTTLE".
export function merchantKey(desc) {
  for (const [name, re] of KNOWN) if (re.test(desc)) return { key: name, name, known: true };
  let s = String(desc).toUpperCase();
  s = s.replace(/^(SQ|TST|SP|PP|PAYPAL|POS|ACH|DEBIT|PURCHASE|RECURRING|CHECKCARD|CKCD|DBT|PYPL|GOOGLE|APL|IN|BT|DD|WWW)\s*\*\s*/g, " ");
  s = s.replace(/^(POS|PURCHASE|DEBIT CARD PURCHASE|RECURRING PAYMENT|CARD PURCHASE|UPI)[\s\-\/:]+/g, " ");
  s = s.replace(/https?:\/\/|WWW\./g, " ");
  s = s.replace(/\.(COM|NET|IO|CO|ORG|IN|AI)\b.*/g, " ");
  s = s.replace(/[#*][\w-]*/g, " ");
  s = s.replace(/\b\d[\d\-\/.]*\b/g, " ");
  s = s.replace(/\b[A-Z]{2}\s*$/g, " "); // trailing state code
  s = s.replace(/[^A-Z&' ]+/g, " ").replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter((w) => w.length > 1 || w === "&");
  const key = words.slice(0, 2).join(" ") || String(desc).toUpperCase().slice(0, 16);
  return { key, name: titleCase(words.slice(0, 3).join(" ") || key), known: false };
}

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const round2 = (n) => Math.round(n * 100) / 100;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};

// ---------- Recurring detection ----------
export const CADENCES = [
  { id: "weekly", label: "Weekly", days: 7, tol: 2, perYear: 52 },
  { id: "monthly", label: "Monthly", days: 30.4, tol: 5, perYear: 12 },
  { id: "quarterly", label: "Quarterly", days: 91, tol: 10, perYear: 4 },
  { id: "yearly", label: "Yearly", days: 365, tol: 15, perYear: 1 },
];

// Returns { items, totalMonthly, totalYearly, start, end, count }
// Each item: { key, name, known, cadence, amount, monthly, yearly, charges, first, last, next, status, priceChange, hint, confidence }
export function findRecurring(txns) {
  if (!txns.length) return { items: [], totalMonthly: 0, totalYearly: 0, count: 0 };
  const start = txns[0].day, end = txns[txns.length - 1].day;
  const groups = new Map();
  for (const t of txns) {
    const m = merchantKey(t.desc);
    if (!groups.has(m.key)) groups.set(m.key, { ...m, txns: [] });
    groups.get(m.key).txns.push(t);
  }

  const items = [];
  for (const g of groups.values()) {
    // A merchant can bill several plans (e.g. Apple: iCloud $2.99 + Apple TV $9.99). Split by amount band.
    for (const band of splitByAmount(g.txns)) {
      const it = analyse(g, band, end);
      if (it) items.push(it);
    }
  }
  items.sort((a, b) => (b.status === "active") - (a.status === "active") || b.yearly - a.yearly);
  const active = items.filter((i) => i.status === "active");
  const totalMonthly = round2(active.reduce((s, i) => s + i.monthly, 0));
  return { items, totalMonthly, totalYearly: round2(active.reduce((s, i) => s + i.yearly, 0)), start: dayToISO(start), end: dayToISO(end), count: txns.length };
}

function splitByAmount(txns) {
  const bands = [];
  for (const t of [...txns].sort((a, b) => a.amount - b.amount)) {
    const b = bands.find((b) => Math.abs(t.amount - b.ref) <= Math.max(3, b.ref * 0.6));
    if (b) b.txns.push(t); else bands.push({ ref: t.amount, txns: [t] });
  }
  return bands.map((b) => b.txns.sort((a, c) => a.day - c.day));
}

function analyse(g, txns, end) {
  // Same-day duplicates count once.
  const list = txns.filter((t, i) => i === 0 || t.day !== txns[i - 1].day);
  if (list.length < 2) return null;
  const gaps = list.slice(1).map((t, i) => t.day - list[i].day);
  const med = median(gaps);
  const cad = CADENCES.find((c) => Math.abs(med - c.days) <= c.tol);
  if (!cad) return null;
  const regular = gaps.filter((d) => Math.abs(d - cad.days) <= cad.tol * 1.6).length / gaps.length;
  const amounts = list.map((t) => t.amount);
  const amt = median(amounts);
  const steady = amounts.filter((a) => Math.abs(a - amt) <= Math.max(0.5, amt * 0.1)).length / amounts.length;

  // Need enough evidence: monthly/weekly want 3+ charges unless it's a known brand.
  const minCharges = cad.id === "weekly" ? 4 : cad.id === "monthly" ? (g.known ? 2 : 3) : 2;
  if (list.length < minCharges) return null;
  if (regular < 0.6) return null;
  if (cad.id === "weekly" && steady < 0.8) return null; // weekly coffee with varying totals isn't a subscription
  if (steady < 0.5) return null;

  const confidence = Math.round(100 * Math.min(1, 0.4 * regular + 0.4 * steady + 0.2 * Math.min(list.length, 6) / 6 + (g.known ? 0.1 : 0)));
  const lastT = list[list.length - 1];
  const latest = lastT.amount;
  const first = list[0].amount;
  const priceChange = Math.abs(latest - first) >= 0.5 && Math.abs(latest - first) / first >= 0.03 ? round2(latest - first) : 0;
  const next = lastT.day + Math.round(cad.days);
  // If the next charge should have landed well before the statement ended, it was probably cancelled.
  const status = end - lastT.day > cad.days + cad.tol * 2 + 3 ? "stopped" : "active";
  const yearly = round2(latest * cad.perYear);
  return {
    key: `${g.key}|${Math.round(amt)}`,
    name: g.name, known: g.known,
    cadence: cad.id, cadenceLabel: cad.label,
    amount: latest, monthly: round2(yearly / 12), yearly,
    charges: list.map((t) => ({ date: t.date, amount: t.amount, desc: t.desc })),
    first: list[0].date, last: lastT.date, next: dayToISO(next),
    status, priceChange, confidence,
    hint: KNOWN_CANCEL.get(g.name) || "Search your email for the sign-up receipt; it usually has a manage-subscription link.",
  };
}

// ---------- Export ----------
export function summaryText(result, picked, fmt) {
  const lines = [`Recurring charges (${result.start} to ${result.end})`, ""];
  for (const i of result.items.filter((i) => i.status === "active")) {
    lines.push(`${picked.has(i.key) ? "[cancel] " : ""}${i.name}: ${fmt(i.amount)} ${i.cadenceLabel.toLowerCase()} (${fmt(i.yearly)}/yr)`);
  }
  lines.push("", `Total: ${fmt(result.totalMonthly)}/month, ${fmt(result.totalYearly)}/year`);
  const save = result.items.filter((i) => picked.has(i.key) && i.status === "active").reduce((s, i) => s + i.yearly, 0);
  if (save) lines.push(`Cancelling the marked ones saves ${fmt(save)}/year`);
  return lines.join("\n");
}

export function toCSV(result) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [["Merchant", "Cadence", "Amount", "Per month", "Per year", "Charges seen", "First", "Last", "Next expected", "Status", "Price change"]];
  for (const i of result.items) rows.push([i.name, i.cadenceLabel, i.amount, i.monthly, i.yearly, i.charges.length, i.first, i.last, i.status === "active" ? i.next : "", i.status, i.priceChange]);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
