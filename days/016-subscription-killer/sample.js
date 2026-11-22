// Made-up demo statement (Chase-style export: charges are negative). No real data.
// 13 months so yearly renewals show up.

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function sampleCSV(endISO = "2026-11-15") {
  const r = rng(16);
  const end = Date.parse(endISO + "T00:00:00Z") / 86400000;
  const start = end - 395;
  const rows = [];
  const add = (day, desc, amt, cat = "Shopping") => {
    if (day < start || day > end) return;
    const d = new Date(day * 86400000);
    const s = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
    rows.push([day, s, desc, cat, amt]);
  };
  const monthly = (dom, desc, amt, cat, from = start, to = end) => {
    for (let day = start; day <= end; day++) {
      const d = new Date(day * 86400000);
      if (d.getUTCDate() === dom && day >= from && day <= to) add(day, desc, typeof amt === "function" ? amt(day) : amt, cat);
    }
  };

  // Subscriptions
  monthly(3, "NETFLIX.COM 866-579-7172 CA", (d) => (d < end - 150 ? 15.49 : 17.99), "Entertainment");
  monthly(8, "Spotify USA 877-778-1161 NY", 11.99, "Entertainment");
  monthly(12, "APPLE.COM/BILL 866-712-7753 CA", 2.99, "Shopping");
  monthly(12, "APPLE.COM/BILL 866-712-7753 CA", 9.99, "Shopping");
  monthly(21, "OPENAI *CHATGPT SUBSCR OPENAI.COM CA", 20.0, "Shopping");
  monthly(1, "PLANET FITNESS #0412 CLUB FEES", 24.99, "Health & Wellness");
  monthly(17, "NYTIMES*NYTDIGITAL 800-698-4637 NY", (d) => (d < end - 240 ? 4.0 : 6.25), "Bills & Utilities");
  monthly(25, "HULU 877-8244858 CA", 7.99, "Entertainment", start, end - 120); // cancelled ~4 months ago
  monthly(5, "VERIZON WRLS P007 ONLINE PMT", 65.0, "Bills & Utilities");
  monthly(14, "SQ *CLEARWATER DOG WALKS", 120.0, "Personal");
  add(end - 385, "Amazon Prime*2K4QJ8 Amzn.com/bill WA", 139.0, "Shopping");
  add(end - 20, "Amazon Prime*7XQ21B Amzn.com/bill WA", 139.0, "Shopping");
  add(end - 380, "ADOBE *CREATIVE CLD ADOBE.LY/ENUS", 239.88, "Shopping");
  add(end - 15, "ADOBE *CREATIVE CLD ADOBE.LY/ENUS", 263.88, "Shopping");

  // Everyday noise that should NOT be flagged
  const shops = [
    ["WHOLEFDS MKT #10234", 40, 140, "Groceries"], ["TRADER JOE S #552", 25, 90, "Groceries"],
    ["STARBUCKS STORE 08812", 4, 12, "Food & Drink"], ["SHELL OIL 57442199", 30, 70, "Gas"],
    ["TST* PIZZERIA DELFINA", 25, 80, "Food & Drink"], ["AMAZON.COM*RT4KX1 AMZN.COM/BILL", 8, 120, "Shopping"],
    ["TARGET 00012345", 15, 110, "Shopping"], ["UBER *TRIP HELP.UBER.COM", 9, 45, "Travel"],
    ["CVS/PHARMACY #04411", 6, 40, "Health & Wellness"], ["PATEL BROTHERS EDISON", 30, 95, "Groceries"],
  ];
  for (let day = start; day <= end; day++) {
    const n = r() < 0.55 ? 1 : r() < 0.3 ? 2 : 0;
    for (let k = 0; k < n; k++) {
      const [desc, lo, hi, cat] = shops[Math.floor(r() * shops.length)];
      add(day, desc, Math.round((lo + r() * (hi - lo)) * 100) / 100, cat);
    }
  }
  monthly(28, "Payment Thank You-Mobile", -1800, "");

  rows.sort((a, b) => b[0] - a[0]);
  const out = ["Transaction Date,Post Date,Description,Category,Type,Amount,Memo"];
  for (const [, d, desc, cat, amt] of rows) {
    const type = amt < 0 ? "Payment" : "Sale";
    out.push(`${d},${d},"${desc}",${cat},${type},${(-amt).toFixed(2)},`);
  }
  return out.join("\n");
}
